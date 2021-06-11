const os = require('os')
const dns = require('dns').promises
const { program: optionparser } = require('commander')
const { Kafka } = require('kafkajs')
const mysqlx = require('@mysql/xdevapi');
const MemcachePlus = require('memcache-plus');
const express = require('express')

const app = express()
const cacheTimeSecs = 15
const numberOfMissions = 30

//Vaccination data fields
const vaccines = Array("Biontech","Astrazeneca","Moderna","Johnson","Sputnik");
const locations = Array("Heilbronn","Stuttgart","Tuebingen","Karlsruhe","Esslingen");
const doctors = Array("Dr.Oetker","Dr.Frankenstein","Dr.Who","Dr.Dolittle","Dr.Watson");

// -------------------------------------------------------
// Command-line options
// -------------------------------------------------------

let options = optionparser
	.storeOptionsAsProperties(true)
	// Web server
	.option('--port <port>', "Web server port", 3000)
	// Kafka options
	.option('--kafka-broker <host:port>', "Kafka bootstrap host:port", "my-cluster-kafka-bootstrap:9092")
	.option('--kafka-topic-tracking <topic>', "Kafka topic to tracking data send to", "tracking-data")
	.option('--kafka-client-id < id > ', "Kafka client ID", "tracker-" + Math.floor(Math.random() * 100000))
	// Memcached options
	.option('--memcached-hostname <hostname>', 'Memcached hostname (may resolve to multiple IPs)', 'my-memcached-service')
	.option('--memcached-port <port>', 'Memcached port', 11211)
	.option('--memcached-update-interval <ms>', 'Interval to query DNS for memcached IPs', 5000)
	// Database options
	.option('--mysql-host <host>', 'MySQL host', 'my-app-mysql-service')
	.option('--mysql-port <port>', 'MySQL port', 33060)
	.option('--mysql-schema <db>', 'MySQL Schema/database', 'popular')
	.option('--mysql-username <username>', 'MySQL username', 'root')
	.option('--mysql-password <password>', 'MySQL password', 'mysecretpw')
	// Misc
	.addHelpCommand()
	.parse()
	.opts()

// -------------------------------------------------------
// Database Configuration
// -------------------------------------------------------

const dbConfig = {
	host: options.mysqlHost,
	port: options.mysqlPort,
	user: options.mysqlUsername,
	password: options.mysqlPassword,
	schema: options.mysqlSchema
};

async function executeQuery(query, data) {
 let session = await mysqlx.getSession(dbConfig);
 if(data){
 	console.log(query + " <- " + data)
 	return await session.sql(query, data).bind(data).execute();
 } else {
 	console.log(query)
 	return await session.sql(query).execute();
 }
}

async function callExecuteQuery(locationParam){	
 const query = "SELECT Imfpstoff, Krankheit, Location, Arzt FROM Anmeldung_Impfung WHERE Location = ?"
 let data = (await executeQuery(query, [locationParam])).fetchOne()
 
 if (data) {
	let result = { impfstoff: data[0], krankheit: data[1], location: data[2], arzt: data[3] }
	return { ...result, cached: false }
} else {
	throw "No data found for this location"
	console.log(":( -err")
}
}

async function getLocations(){
	const key = 'locations'

		let executeResult = await executeQuery("SELECT name FROM Locations", [])
		let data = executeResult.fetchAll()
		if (data) {
			let result = data.map(row => row[0])
			return { result, cached: false }
		} else {
			throw "No locations-data found"
		}
}

// Get popular missions (from db only)
async function getPopular(maxCount) {
	const query = "SELECT location, count FROM popularlocs ORDER BY count DESC LIMIT ?"
	return (await executeQuery(query, [maxCount]))
		.fetchAll()
		.map(row => ({ location: row[0], count: row[1] }))
}

// Kafka connection
const kafka = new Kafka({
	clientId: options.kafkaClientId,
	brokers: [options.kafkaBroker],
	retry: {
		retries: 0
	}
})

const producer = kafka.producer()

// Send tracking message to Kafka
async function sendTrackingMessage(data) {
	//Ensure the producer is connected
	await producer.connect()
	console.log("data to be sent to kafka: " + JSON.stringify(data))
	//Send message
	await producer.send({
		topic: options.kafkaTopicTracking,
		messages: [
			{ value: JSON.stringify(data) }
		]
	})
}

async function conduct_vac_at_location(location){

	
	var vac = vaccines[Math.floor(Math.random() * vaccines.length)];
	var doc = doctors[Math.floor(Math.random() * doctors.length)];
	const query = "INSERT INTO Anmeldung_Impfung (Imfpstoff, Krankheit, Location, Arzt) VALUES ('"+ vac +"', 'Covid-19', '"+ location +"', '"+ doc +"');"
	await executeQuery(query)
		//Send message
		sendTrackingMessage({
			location,
			timestamp: Math.floor(new Date() / 1000)
		}).then(() => console.log("Single vaccination data has been sent to kafka."))
		.catch(e => console.log("Error sending your vaccination data to kafka.", e))
	
		console.log("done.")
}

async function produce_random_data() {

	const maxRepetitions = Math.floor(Math.random() * 200)

	for(var i = 0; i < maxRepetitions; ++i) {
		var location = locations[Math.floor(Math.random() * locations.length)];
		var vac = vaccines[Math.floor(Math.random() * vaccines.length)];
		var doc = doctors[Math.floor(Math.random() * doctors.length)];

		
		//Insert Into MySql
		const query = "INSERT INTO Anmeldung_Impfung (Imfpstoff, Krankheit, Location, Arzt) VALUES ('"+ vac +"', 'Covid-19', '"+ location +"', '"+ doc +"');"
		await executeQuery(query)

		//Send message
		sendTrackingMessage({
			location,
			timestamp: Math.floor(new Date() / 1000)
		}).then(() => console.log("Vaccination data has been sent to kafka."))
		.catch(e => console.log("Error sending your vaccination data to kafka.", e))

	}
	console.log("done.")
}

function sendResponseSingleView(res, html, location) {
	res.send(`<!DOCTYPE html>
		<html lang="en" style = "font-family:helvetica;">
		<head>
		<script>
		function conduct_vacc_at_center(location) {
			fetch("/conduct_vac_at_center/${location}", {cache: 'no-cache'})
		}
		</script>
		</head>
		<body>
			<h1>Vaccination Center: "${location}"</h1>	
			<p>
			<a href="javascript: conduct_vacc_at_center();">
					<button>💉</button> </a>
			</p>
			${html}
			<hr>
			<h2>Information about the generated page</h4>
		</body>
	</html>
	`)
}

function sendResponse(res, html) {
	res.send(`<!DOCTYPE html>
		<html lang="en" style = "font-family:helvetica; color: #537bd2">
		<head>
		<script>
			function conductVaccs() {
				fetch("/produce_random_data", {cache: 'no-cache'})
			}
		</script>
		</head>
		<body>
				<p>
					<a href="javascript: conductVaccs();">
					<button>Conduct le vaccinations</button> </a>
				</p>
			${html}
			<hr>
			<h3>Information about the generated page</h3>
		</body>
	</html>
	`)
}

function sendMap(res, html, locations, popular) {

	// for(var i = 0; i < locations.length; ++i) {
    //     var circle = L.circle([48.742154, 9.304733], {
    //         color: '#43a6bd',
    //         fillColor: '#98f5ff',
    //         fillOpacity: 0.5,
    //         radius: 5000         //Add location Data to DB
    //     }).addTo(map);

	// }

	res.send(`
	${html}
	<!DOCTYPE html>
		<html lang="en" style = "font-family:helvetica; color: #537bd2">
		<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
	
		<!-- leaflet css  -->
		<link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
	
		<style>
			body {
				margin: 0;
				padding: 15px;
			}
	
			#map {
				height: 550px; width: 550px
			}
		</style>
	</head>
	
	<body>
		<div id="map">
			<div class="leaflet-control coordinate"></div>
		</div>
	</body>
	
	</html>
	
	<!-- leaflet js  -->
	<script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
	

	<script>
		// Map initialization 
		var map = L.map('map').setView([48.940318, 8.925018], 8);
	
		 var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
		});
		osm.addTo(map);

        var Escircle = L.circle([48.742154, 9.304733], {
            color: '#43a6bd',
            fillColor: '#98f5ff',
            fillOpacity: 0.5,
            radius: (10000/${popular[0].count})*${popular[0].count}
        }).addTo(map);

        var Hbcircle = L.circle([49.138597, 9.223022], {
            color: '#43a6bd',
            fillColor: '#98f5ff',
            fillOpacity: 0.5,
            radius: (10000/${popular[0].count})*${popular[1].count}
        }).addTo(map);

        var Stcircle = L.circle([48.781533, 9.18457], {
            color: '#43a6bd',
            fillColor: '#98f5ff',
            fillOpacity: 0.5,
            radius: (10000/${popular[0].count})*${popular[2].count}
        }).addTo(map);

        var Tuecircle = L.circle([48.516604, 9.058228], {
            color: '#43a6bd',
            fillColor: '#98f5ff',
            fillOpacity: 0.5,
            radius: (10000/${popular[0].count})*${popular[3].count}
        }).addTo(map);

        var Kacircle = L.circle([49.012654, 8.410034], {
            color: '#43a6bd',
            fillColor: '#98f5ff',
            fillOpacity: 0.5,
            radius: (10000/${popular[0].count})*${popular[4].count}
        }).addTo(map);
	
		
		Escircle.bindPopup("<b>Esslingen</b><br>Vaccination Center Esslingen");
        Hbcircle.bindPopup("<b>Heilbronn</b><br>Vaccination Center Heilbronn");
        Stcircle.bindPopup("<b>Stuttgart</b><br>Vaccination Center Esslingen");
        Tuecircle.bindPopup("<b>Tuebingen</b><br>Vaccination Center Esslingen");
        Kacircle.bindPopup("<b>Karlsruhe</b><br>Vaccination Center Karlsruhe");

	
	</script>
	`)
}

// Return HTML for start page
app.get("/", (req, res) => {

		const html = `
			<h3  >All Vaccination Centres in Germany:</h3>
			<p>
			<a href='locations/Esslingen'> Esslingen</a> <br>
			<a href='locations/Karlsruhe'> Karlsruhe </a> <br>
			<a href='locations/Tuebingen'> Tübingen </a> <br>
			<a href='locations/Stuttgart'> Stuttgart </a> <br>
			<a href='locations/Heilbronn'> Heilbronn </a> <br>
			<a href='dashboard'> >Dashboard< </a> <br>
			</p>
		`
		sendResponse(res, html)

	})


// Return HTML for start page
app.get("/dashboard", (req, res) => {
	const topX = 10;
	Promise.all([getLocations(), getPopular(topX)]).then(values =>{
		const locations = values[0]
		const popular = values[1]

		console.log(locations)
		console.log(popular)

		const popularHtml = popular
		.map(pop => `<li> <a href='locations/${pop.location}'>${pop.location}</a> (${pop.count} vaccinations) </li>`)
		.join("\n")

		const locationsHtml = locations.result
		.map(m => `<a href='locations/${m}'>${m}</a>`)
		.join(", ")

		const html = `
		 		<h1>Top ${topX} Vaccination Centers</h1>	
				 <p>
				 <ol style="margin-left: 2em;"> ${popularHtml} </ol> 
			 	 </p>
				<h1>All Vaccination Centres</h1>
		 		<p> ${locationsHtml} </p>
		 	`

		sendResponse(res, html)
	})

})

	app.get("/produce_random_data", (req, res) => {

		produce_random_data().then(
		res.send(`<!DOCTYPE html>
		<html lang="en" style = "font-family:helvetica; color: #537bd2">
		<a>data was sent</a>
		</html>
		`)
		)
	})

	app.get("/conduct_vac_at_center/:location", (req, res) => {

		location = req.params["location"]
		conduct_vac_at_location(location).then(
			res.send(`<!DOCTYPE html>
			<html lang="en" style = "font-family:helvetica; color: #537bd2">
			<a>data was sent</a>
			</html>
			`)
			)
	});

	app.get("/locations/:location", (req, res) => {

		//Städteansicht
		location = req.params["location"]
		console.log(location + " was called.")
		callExecuteQuery(location).then(data => {
			sendResponseSingleView(res, `<h1>${data.impfstoff}</h1><p>${data.krankheit}</p><p>${data.location}</p>` +
				data.arzt.split("\n").map(p => `<p>${p}</p>`).join("\n")
				,location
			)
		}).catch(err => {
			sendResponseSingleView(res, `<h1>Error</h1><p>${err}</p>`, location)
		})
	});

	// Return HTML for start page
app.get("/map", (req, res) => {
	const topX = 10;
	Promise.all([getLocations(), getPopular(topX)]).then(values =>{
		const locations = values[0]
		const popular = values[1]
		
		console.log(popular[0])
		console.log(popular[1])
		console.log(popular[2])
		console.log(popular[3])
		console.log(popular[4])

		const popularHtml = popular
		.map(pop => `<li> <a href='locations/${pop.location}'>${pop.location}</a> (${pop.count} vaccinations) </li>`)
		.join("\n")

		const locationsHtml = locations.result
		.map(m => `<a href='locations/${m}'>${m}</a>`)
		.join(", ")

		const html = `

				<h1>Vaccination Overview Germany</h1>
				<p>
				<ol style="margin-left: 2em;"> ${popularHtml} </ol> 
				 </p>
		 		<p> ${locationsHtml} </p>
		 	`

	sendMap(res, html, locations, popular)
	})

})

// -------------------------------------------------------
// Main method
// -------------------------------------------------------

app.listen(options.port, function () {
	console.log("Node app is running at http://localhost:" + options.port)
});
