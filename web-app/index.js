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

async function getSingleLocation(location){
	
	const query = "Select * from Locations Where name = ?"
	let executeResult = await executeQuery(query, location) 
	let data = executeResult.fetchAll()
	if (data) {
		return data // , cached False
	} else {
		throw "No Single-location-data found"
	}
}

async function getLocations(){

		let executeResult = await executeQuery("SELECT name, lat, lon FROM Locations", []) 
		let data = executeResult.fetchAll()
		if (data) {
			let city = data.map(row => row[0])
			let lat = data.map(row => row[1])
			let lon = data.map(row => row[2])
			return { city, lat, lon} // , cached False
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

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function produce_random_data(locations) {

	const maxRepetitions = Math.floor(Math.random() * 150)
	console.log("the locations in produce data: " + locations)

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

			await timeout(50);
	}
	console.log("done.")
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

		<style>
									/* Add a black background color to the top navigation */
									.topnav {
									background-color: #333;
									overflow: hidden;
									}
									
									/* Style the links inside the navigation bar */
									.topnav a {
									float: left;
									color: #f2f2f2;
									text-align: center;
									padding: 14px 16px;
									text-decoration: none;
									font-size: 17px;
									}
									
									/* Change the color of links on hover */
									.topnav a:hover {
									background-color: #ddd;
									color: black;
									}
									
									/* Add a color to the active/current link */
									.topnav a.active {
									background-color: #04AA6D;
									color: white;
									}
									body {
										margin: 0;
									}
    	</style>

		</head>
		<body>
			<div class="topnav">
				<a class="active" href="/">Home</a>
				<a href="/map">Map</a>
				<a href="/dashboard">Dashboard</a>
				<a href="/about">About</a>
			</div> 

			<h1>All Vaccination Centres in Germany:</h1>
				${html}
				<p>
					<a href="javascript: conductVaccs();">
						<button>Conduct le vaccinations</button> 
					</a>
				</p>
			<hr>
		</body>
	</html>
	`)
}

function sendSingleCenterMap(res, html, location, popular) {
	

	var locationsAsString = JSON.stringify(location)
	var popularAsString = JSON.stringify(popular)
	console.log(popularAsString)

	res.send(`
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
			}
	
			#map {
				height: 550px; width: 550px
			}

			/* Add a black background color to the top navigation */
			.topnav {
			background-color: #333;
			overflow: hidden;
			}
			
			/* Style the links inside the navigation bar */
			.topnav a {
			float: left;
			color: #f2f2f2;
			text-align: center;
			padding: 14px 16px;
			text-decoration: none;
			font-size: 17px;
			}
			
			/* Change the color of links on hover */
			.topnav a:hover {
			background-color: #ddd;
			color: black;
			}
			
			/* Add a color to the active/current link */
			.topnav a.active {
			background-color: #04AA6D;
			color: white;
			}

		</style>
	</head>
	
	<body>

		<div class="topnav">
			<a class="active" href="/">Home</a>
			<a href="/map">Map</a>
			<a href="/dashboard">Dashboard</a>
			<a href="/about">About</a>
		</div> 

		<div id="map" style="float: left; width:50%;">
			<div class="leaflet-control coordinate"></div>
		</div>
	</body>

	${html}
	
	</html>
	
	<!-- leaflet js  -->
	<script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
	

	<script>
		// Map initialization 
		var map = L.map('map').setView([50.9932795, 11.0133948], 6);
	
		 var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
		});
		osm.addTo(map);

		
		var locationObjContainer = ${locationsAsString}
		var locationObj = locationObjContainer[0]
		var popularObj = ${popularAsString}

		var currentCity = locationObj[0]
		
		var radius = 5000
		var count = 0
		for(var j = 0; j < popularObj.length; j++) {
			if(locationObj[0] == popularObj[j].location){
				radius = (40000/popularObj[0].count)*popularObj[j].count
				count = popularObj[j].count
			}
		}
		console.log(locationObj)
		var Newcircle = L.circle([ locationObj[1], locationObj[2]], {
			color: '#43a6bd',
			fillColor: '#98f5ff',
			fillOpacity: 0.5,
			radius: radius
		}).addTo(map);

		Newcircle.bindPopup("<b>" + currentCity + "</b><br>Vaccination Center " + currentCity + "<br> Count: " + count);
		

	</script>
	`)
}

function sendMap(res, html, locations, popular) {
	

	var locationsAsString = JSON.stringify(locations)
	var popularAsString = JSON.stringify(popular)

	res.send(`
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
			}
	
			#map {
				height: 550px; width: 550px
			}

			/* Add a black background color to the top navigation */
			.topnav {
			background-color: #333;
			overflow: hidden;
			}
			
			/* Style the links inside the navigation bar */
			.topnav a {
			float: left;
			color: #f2f2f2;
			text-align: center;
			padding: 14px 16px;
			text-decoration: none;
			font-size: 17px;
			}
			
			/* Change the color of links on hover */
			.topnav a:hover {
			background-color: #ddd;
			color: black;
			}
			
			/* Add a color to the active/current link */
			.topnav a.active {
			background-color: #04AA6D;
			color: white;
			}

		</style>
	</head>
	
	<body>

		<div class="topnav">
			<a class="active" href="/">Home</a>
			<a href="map">Map</a>
			<a href="dashboard">Dashboard</a>
			<a href="">About</a>
		</div> 

		<div id="map" style="float: left; width:50%;">
			<div class="leaflet-control coordinate"></div>
		</div>
	</body>

	${html}
	
	</html>
	
	<!-- leaflet js  -->
	<script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
	

	<script>
		// Map initialization 
		var map = L.map('map').setView([50.9932795, 11.0133948], 6);
	
		 var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
		});
		osm.addTo(map);

		var serializedLocs = ${locationsAsString}
		var serializedPops = ${popularAsString}
		var locationObj = serializedLocs
		var popularObj = serializedPops
		
		for(var i = 0; i < locationObj.city.length; i++) {
			var radius = 5000
			var count = 0
			for(var j = 0; j < popularObj.length; j++) {
				if(locationObj.city[i] == popularObj[j].location){
					radius = (40000/popularObj[0].count)*popularObj[j].count
					count = popularObj[j].count
				}
			}
			var Newcircle = L.circle([ locationObj.lat[i], locationObj.lon[i]], {
				color: '#43a6bd',
				fillColor: '#98f5ff',
				fillOpacity: 0.5,
				radius: radius
			}).addTo(map);

			var currentCity = locationObj.city[i]
			Newcircle.bindPopup("<b>" + currentCity + "</b><br>Vaccination Center " + currentCity + "<br> Count: " + count);
		}
	</script>
	`)
}

// Return HTML for start page
app.get("/", (req, res) => {
		Promise.all([getLocations()]).then(values =>{
			const locations = values[0]
			
			const locationsHtml = locations.city
			.map(m => `<a href='locations/${m}'>${m}</a>`)
			.join(", ")
	
			const html = `
					<p>
					<ol style="margin-left: 2em;"> ${locationsHtml} </ol> 
					 </p>
				 `
			sendResponse(res, html)
		})
	})


// Return HTML for start page
app.get("/dashboard", (req, res) => {
	const topX = 10;
	Promise.all([getLocations(), getPopular(topX)]).then(values =>{
		const locations = values[0]
		const popular = values[1]

		const popularHtml = popular
		.map(pop => `<li> <a href='locations/${pop.location}'>${pop.location}</a> (${pop.count} vaccinations) </li>`)
		.join("\n")

		const locationsHtml = locations.city
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


		Promise.all([getLocations()]).then(values =>{
			const locations = values[0]
				
			produce_random_data(locations.city).then(
				res.send(`<!DOCTYPE html>
				<html lang="en" style = "font-family:helvetica; color: #537bd2">
				<a>data was sent</a>
				</html>
				`)
				)
		})

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
		const topX = 200;		
		location = req.params["location"]
		const html = ``
		Promise.all([getSingleLocation(location), getPopular(topX)]).then(values =>{
			const location = values[0]
			const popular = values[1]
			sendSingleCenterMap(res, html, location, popular)
		})
	});

	// Return HTML for start page
app.get("/map", (req, res) => {
	const topX = 200;
	Promise.all([getLocations(), getPopular(topX)]).then(values =>{
		const locations = values[0]
		const popular = values[1]
		
		const popularHtml = popular
		.map(pop => `<li> <a href='locations/${pop.location}'>${pop.location}</a> (${pop.count} vaccinations) </li>`)
		.join("\n")

		const locationsHtml = locations.city
		.map(m => `<a href='locations/${m}'>${m}</a>`)
		.join(", ")

		const html = `
				<p>
				<ol style="margin-left: 52% ;"> ${popularHtml} </ol> 
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
