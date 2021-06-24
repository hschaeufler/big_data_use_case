from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import IntegerType, StringType, StructType, TimestampType, StructField
import mysqlx

dbOptions = {"host": "impfpass-vaccination-db-service", 'port': 33060, "user": "root", "password": "root"}
dbSchema = 'vacbook'


waterMark = '10 minutes'

#--------------1. Create a spark session-------------------------------------------------------------------------------#
# Set useDeprecatedOffsetFetching to False for better Performance
spark = SparkSession.builder \
    .appName("StructuredVaccinationStream") \
    .config("spark.sql.streaming.kafka.useDeprecatedOffsetFetching", False) \
    .getOrCreate()

# Set log level
spark.sparkContext.setLogLevel('WARN')
#--------------2. Get Messages from Kafka------------------------------------------------------------------------------#
# Have a look at https://spark.apache.org/docs/latest/structured-streaming-kafka-integration.html

# Read Vaccination-Claims from Kafka with earliest startingOffset for streaming
dfClaims = spark \
    .readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers",
            "my-cluster-kafka-bootstrap:9092") \
    .option("subscribe", "CLAIM-TOPIC") \
    .option("startingOffsets", "earliest") \
    .load()

# Read Vaccination-Registrations from Kafka with earliest startingOffset for streaming

dfRegistrations = spark \
    .readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers",
            "my-cluster-kafka-bootstrap:9092") \
    .option("subscribe", "REGISTRATION-TOPIC") \
    .option("startingOffsets", "earliest") \
    .load()


#--------------3. Defining Schemas-------------------------------------------------------------------------------------#
# Have a look at https://sparkbyexamples.com/pyspark/pyspark-structtype-and-structfield/
# and https://spark.apache.org/docs/latest/api/python/reference/api/pyspark.sql.types.StructType.html
# Define schema of tracking data

vaccinationRegistrationSchema = StructType([ \
    StructField("timestamp", TimestampType(), False), \
    StructField("uuid", StringType(), False), \
    StructField("vaccine", StringType(), False), \
    StructField("disease", StringType(), False), \
    StructField("chargeNumber", StringType(), False), \
    StructField("location", StringType(), False), \
    StructField("doctorsOffice", StringType(), False), \
    StructField("doctorsId", StringType(), False), \
 ])

#Define schema of tracking data
vaccinationClaimSchema = StructType([ \
    StructField("timestamp", TimestampType(), False), \
    StructField("uuid", StringType(), False), \
    StructField("registrationId", StringType(), False), \
    StructField("vaccinatedperson", StringType(), False), \
    StructField("userid", StringType(), False), \
  ])

#--------------4. Convert Dataformat-----------------------------------------------------------------------------------#
# Cast from Byte to String, Convert Json-Data explode it in to columns, set Watermarks and Rename Columns
#http://spark.apache.org/docs/latest/api/python/reference/api/pyspark.sql.functions.from_json.html
#https://stackoverflow.com/questions/51070251/pyspark-explode-json-in-column-to-multiple-columns

dfRegistrationsWithWM = dfRegistrations \
    .selectExpr("CAST(value AS STRING)")\
    .withColumn("jsondata",from_json(col("value"), vaccinationRegistrationSchema))\
    .select(col("jsondata.*"))\
    .withColumnRenamed("timestamp", "registration_timestamp") \
    .withWatermark("registration_timestamp", waterMark) \
    .withColumnRenamed("uuid", "registration_uuid")

dfClaimsWithWM = dfClaims \
    .selectExpr("CAST(value AS STRING)") \
    .withColumn("jsondata",from_json(col("value"), vaccinationClaimSchema)) \
    .select(col("jsondata.*")) \
    .withWatermark("timestamp", waterMark) \
    .withColumnRenamed("uuid", "vaccionation_uuid")


#--------------5. Print to Console-------------------------------------------------------------------------------------#

# Print Registrations to Console
registrationConsoleDump = dfRegistrationsWithWM \
    .writeStream \
    .format("console") \
    .outputMode("Append") \
    .start()


# Print Claims to Console
claimConsoleDump = dfClaimsWithWM \
    .writeStream \
    .format("console") \
    .outputMode("Append") \
    .start()

#--------------6. Join the two Dataframes with Watermarks--------------------------------------------------------------#


dfVaccination = dfClaimsWithWM\
    .join(dfRegistrationsWithWM,
    expr("""
    registrationId = registration_uuid AND
    timestamp >= registration_timestamp AND
    timestamp <= registration_timestamp + interval 15 minutes
    """));

#--------------7. Format for SQL---------------------------------------------------------------------------------------#
# Need to Covert the Timestamps to MySQL-Timestamp-Format
dfVaccinationOutput = dfVaccination \
    .withColumn("timestamp",date_format(dfVaccination.timestamp, "yyyy-MM-dd kk:mm:ss")) \
    .withColumn("registration_timestamp",date_format(dfVaccination.registration_timestamp, "yyyy-MM-dd  kk:mm:ss"))

#--------------8. Define Custom Database-Function----------------------------------------------------------------------#


def saveToDatabase(batchDataframe, batchId):
    # Define function to save a dataframe to mysql
    def save_to_db(iterator):
        # Connect to database and use schema
        session = mysqlx.get_session(dbOptions)
        session.sql("USE vacbook").execute()
        for row in iterator:
            # Run upsert (insert or update existing)
            sql = session.sql("INSERT IGNORE INTO vaccination "
                              "(uuid, "
                              "vaccine, "
                              "chargeNumber, "
                              "disease, "
                              "location, "
                              "timestamp, "
                              "doctors_officename, "
                              "registration_uuid, "
                              "doctors_userid, "
                              "vaccinatedperson_name, "
                              "vaccinatedperson_userid, "
                              "registration_timestamp) "
                              "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")

            sql.bind(row.vaccionation_uuid,
                     row.vaccine,
                     row.chargeNumber,
                     row.disease,
                     row.location,
                     row.timestamp,
                     row.doctorsOffice,
                     row.registration_uuid,
                     row.doctorsId,
                     row.vaccinatedperson,
                     row.userid,
                     row.registration_timestamp) \
                .execute()

        session.close()

    # Perform batch UPSERTS per data partition
    batchDataframe.foreachPartition(save_to_db)



#--------------9. Write Stream to Output-Sink and Console--------------------------------------------------------------#

dbInsertStream = dfVaccinationOutput \
    .writeStream \
    .outputMode("Append") \
    .foreachBatch(saveToDatabase) \
    .start()

# Start running the query; print running counts to the console
vaccinationConsoleDump = dfVaccinationOutput \
    .writeStream \
    .format("console") \
    .outputMode("Append") \
    .start()


spark.streams.awaitAnyTermination()