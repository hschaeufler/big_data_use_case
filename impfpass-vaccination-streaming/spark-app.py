from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import IntegerType, StringType, StructType, TimestampType, StructField
import mysqlx

dbOptions = {"host": "impfpass-vaccination-db-service", 'port': 33060, "user": "root", "password": "root"}
dbSchema = 'vacbook'


waterMark = '2 hours'
slidingDuration = '10 seconds'

# Create a spark session
spark = SparkSession.builder \
    .appName("StructuredVaccinationStream")\
    .getOrCreate()

# Set log level
spark.sparkContext.setLogLevel('WARN')

# Have a look at https://spark.apache.org/docs/latest/structured-streaming-kafka-integration.html
# Read Vaccination-Claims from Kafka with earliest startingOffset for streaming
dfClaims = spark \
    .readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers",
            "my-cluster-kafka-bootstrap:9092") \
    .option("subscribe", "CLAIM-TOPIC") \
    .option("startingOffsets", "earliest") \
    .load()\
    .selectExpr("CAST(value AS STRING)")

# Read Vaccination-Registrations from Kafka with earliest startingOffset for streaming
dfRegistrations = spark \
    .readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers",
            "my-cluster-kafka-bootstrap:9092") \
    .option("subscribe", "REGISTRATION-TOPIC") \
    .option("startingOffsets", "earliest") \
    .load()\
    .selectExpr("CAST(value AS STRING)")

#--------------2. Defining Schemas-------------------------------------------------------------------------------------#
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

#--------------3. Convert Dataformat-----------------------------------------------------------------------------------#
#http://spark.apache.org/docs/latest/api/python/reference/api/pyspark.sql.functions.from_json.html
#
dfRegistrations = dfRegistrations\
    .withColumn("jsondata",from_json(dfRegistrations.value, vaccinationRegistrationSchema))\
    .select(col("jsondata.*"))\
    .withColumnRenamed("timestamp", "registration_timestamp") \
    .withWatermark("registration_timestamp", waterMark) \
    .withColumnRenamed("uuid", "registration_uuid")

dfClaims = dfClaims \
    .withColumn("jsondata",from_json(dfClaims.value, vaccinationClaimSchema)) \
    .select(col("jsondata.*")) \
    .withWatermark("timestamp", waterMark) \
    .withColumnRenamed("uuid", "vaccionation_uuid")

#https://stackoverflow.com/questions/51070251/pyspark-explode-json-in-column-to-multiple-columns


#--------------4. Inner Joins___________-------------------------------------------------------------------------------#
#see: https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html
# Inner Joins with optional Watermarking

dfVaccination = dfRegistrations\
    .join(dfClaims,dfClaims.registrationId == dfRegistrations.registration_uuid)

#--------------5.Back to Json for Kafka--------------------------------------------------------------------------------#
# see https://stackoverflow.com/questions/60435907/pyspark-merge-multiple-columns-into-a-json-column

#dfKafka = dfVaccination\
#    .selectExpr("vaccionation_uuid as key","to_json(struct(*)) as value")
#--------------6. Print Result to console------------------------------------------------------------------------------#
# Start running the query; print running counts to the console
vaccinationConsoleDump = dfVaccination\
    .writeStream \
    .format("console") \
    .outputMode("Append") \
    .start()


def saveToDatabase(batchDataframe, batchId):
    # Define function to save a dataframe to mysql
    def save_to_db(iterator):
        # Connect to database and use schema
        session = mysqlx.get_session(dbOptions)
        session.sql("USE vacbook").execute()

        for row in iterator:
            print(row.vaccionation_uuid)
            print(row.vaccine)
            print(row.chargeNumber)
            print(row.disease)
            print(row.location)
            print(row.timestamp)
            print(row.doctorsOffice)
            print(row.registration_uuid)
            print(row.doctorsId)
            print(row.vaccinatedperson)
            print(row.userid)
            print(row.registration_timestamp)
            # Run upsert (insert or update existing)
            sql = session.sql("INSERT INTO vaccination " +
                              "(uuid, " +
                              "vaccine, " +
                              "chargeNumber, " +
                              "disease, " +
                              "location, " +
                              "timestamp, " +
                              "doctors_officename, " +
                              "registration_uuid, " +
                              "doctors_uiserid, " +
                              "vaccinatedperson_name, " +
                              "vaccinatedperson_userid, " +
                              "registration_timestamp) " +
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
                     row.registration_timestamp)\
                .execute()

        session.close()

    # Perform batch UPSERTS per data partition
    batchDataframe.foreachPartition(save_to_db)

# Example Part 7


dbInsertStream = dfVaccination.writeStream \
    .trigger(processingTime=slidingDuration) \
    .outputMode("Append") \
    .foreachBatch(saveToDatabase) \
    .start()


spark.streams.awaitAnyTermination()

