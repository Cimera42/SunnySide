let apiKey = "AIzaSyCJMRhIpOpG6RSPeaBkG_B4qrXDsH1Z3GI";
let map;

function init()
{
	setTime();
	document.getElementById("timeInput").disabled = !document.getElementById("timeCheckbox").checked;
}

function setTime()
{
	document.getElementById("timeInput").value = nowTime();
}

function nowTime()
{
	let date = new Date();
	return date.getHours() + ":" + date.getMinutes();
}

function relTime(time)
{
	return new Date(new Date().toDateString() + " " + time)
}

function toggleTime(e)
{
	document.getElementById("timeInput").disabled = !e.target.checked;
}

function initMap() 
{
	let mapConfig = {
		center: {
			lat: -34.397,
			lng: 150.644
		},
		zoom: 8
	};
	map = new google.maps.Map(document.getElementById('map'), mapConfig);

	map.addListener('click', function() {
		if(startInfoWindow) startInfoWindow.close();
		if(endInfoWindow) endInfoWindow.close();
	});
	
	let sA = new google.maps.places.Autocomplete(document.querySelector("#startAddress"), {});
	let sE = new google.maps.places.Autocomplete(document.querySelector("#endAddress"), {});
	sA.bindTo('bounds', map);
	sE.bindTo('bounds', map);
}

let startTime, endTime, timeDiff;
let totalDuration, totalDistance;
let directionsResultVar;
let startMarker, endMarker;
let startInfoWindow, endInfoWindow;
let segments = [];
let segmentLines = [];
let segmentSunLines = [];
let leftTally = 0;
let rightTally = 0;

function doDirections()
{
	segments.length = 0;

	let transitMode = document.querySelector(".transitModeButtons input:checked").value;

	let directionsService = new google.maps.DirectionsService();
	directionsService.route({
		origin: document.getElementById("startAddress").value,
		destination: document.getElementById("endAddress").value,
		travelMode: transitMode,
	}, directionResultCallback);
}

function directionResultCallback(directionsResult, directionsStatus)
{
	if(directionsStatus === "OK")
	{
		directionsResultVar = directionsResult;
		totalDuration = directionsResult.routes[0].legs[0].duration.value*1000;
		totalDistance = directionsResult.routes[0].legs[0].distance.value;

		document.getElementById("routeDistance").innerText = directionsResult.routes[0].legs[0].distance.text;
		document.getElementById("routeDuration").innerText = directionsResult.routes[0].legs[0].duration.text;

		if(document.getElementById("timeCheckbox").checked)
			startTime = relTime(document.getElementById("timeInput").value).getTime();
		else
			startTime = new Date().getTime();
		endTime = startTime + totalDuration;
		timeDiff = endTime - startTime;

		let arrLength = directionsResult.routes[0].overview_path.length;
		let distanceTally = 0;
		for(let i = 0; i < arrLength-1; ++i)
		{
			let segment = {
				start: directionsResult.routes[0].overview_path[i],
				end: directionsResult.routes[0].overview_path[i+1],
			};
			segment.heading = google.maps.geometry.spherical.computeHeading(segment.start, segment.end);
			segment.distancePrior = distanceTally;
			segment.distance = google.maps.geometry.spherical.computeDistanceBetween(segment.start, segment.end);
			segment.startTime = startTime + (segment.distancePrior/totalDistance)*timeDiff;
			segment.endTime = startTime + ((segment.distancePrior+segment.distance)/totalDistance)*timeDiff;
			distanceTally += segment.distance;

			segments.push(segment);
		}

		calcSun();
	}
	else
	{
		console.log(directionsStatus);
	}
}

function calcSun()
{
	leftTally = 0;
	rightTally = 0;

	if(document.getElementById("timeCheckbox").checked)
		startTime = relTime(document.getElementById("timeInput").value).getTime();
	else
		startTime = new Date().getTime();
	endTime = startTime + totalDuration;
	timeDiff = endTime - startTime;

	let isLeft = true;

	segments.forEach(segment => {
		segment.startTime = startTime + (segment.distancePrior/totalDistance)*timeDiff;
		segment.endTime = startTime + ((segment.distancePrior+segment.distance)/totalDistance)*timeDiff;

		let sunData = SunCalc.getPosition(segment.startTime, segment.start.lat(), segment.start.lng());
		let angle = Math.PI/2 + sunData.azimuth;

		let proj = map.getProjection();
		let pp = proj.fromLatLngToPoint(segment.start);
		let x = pp.x + (Math.cos(angle) * Math.cos(sunData.altitude))/50;
		let y = pp.y + (Math.sin(angle) * Math.cos(sunData.altitude))/50;
		let scale = Math.pow(2,map.getZoom());
		segment.sunPoint = new google.maps.Point(x, y);
		segment.sunHeading = google.maps.geometry.spherical.computeHeading(segment.start, proj.fromPointToLatLng(segment.sunPoint));

		//left = +90
		//right = -90
		//-1 good -> 1 bad
		let side = isLeft ? 90 : -90;
		if(sunData.altitude >= 0)
		{
			segment.sunRating = Math.cos(toRad(segment.sunHeading-(segment.heading+side)));
			leftTally += segment.sunRating * (isLeft ? 1:-1);
			rightTally -= segment.sunRating * (isLeft ? 1:-1);
		}
		else
			segment.sunRating = 0;
	});

	console.log("Left: ", leftTally.toFixed(2));
	console.log("Right: ", rightTally.toFixed(2));

	if(leftTally == rightTally)
	{
		document.querySelector("input[value='left']").checked = false;
		document.querySelector("input[value='right']").checked = false;
	}
	else if(leftTally > rightTally)
		document.querySelector("input[value='left']").checked = true;
	else
		document.querySelector("input[value='right']").checked = true;

	drawRoute();
}

function drawRoute()
{
	segmentLines.forEach(v => v.setMap(null));
	segmentSunLines.forEach(v => v.setMap(null));
	segmentLines.length = 0;
	segmentSunLines.length = 0;
	if(startMarker)
	{
		startMarker.setMap(null);
		startMarker = null;
	}
	if(startInfoWindow)
	{
		startInfoWindow.setMap(null);
		startInfoWindow = null;
	}
	if(endMarker)
	{
		endMarker.setMap(null);
		endMarker = null;
	}
	if(endInfoWindow) 
	{
		endInfoWindow.setMap(null);
		endInfoWindow = null;
	}

	let side = (document.querySelector(".sideButtons input:checked") || {value:"left"}).value;
	let proj = map.getProjection();

	segments.forEach(segment => {
		let sunRatingNormal = segment.sunRating;
		if(side === "right")
			sunRatingNormal *= -1;
		sunRatingNormal = (sunRatingNormal +1)/2;
		let red = 256 - sunRatingNormal * 256;
		let green = sunRatingNormal * 256;
		
		let sunDir = new google.maps.Polyline({
			path: [
				segment.start,
				proj.fromPointToLatLng(segment.sunPoint)
			],
			strokeColor: `orange`,
			strokeOpacity: 1.0,
			strokeWeight: 1,
			zIndex: 5
		});
		sunDir.setMap(map);
		segmentSunLines.push(sunDir);

		let poly = new google.maps.Polyline({
			path: [
				segment.start,
				segment.end
			],
			//strokeColor: 'hsl(' + Math.floor(segment.heading) + ',100%,50%)',
			strokeColor: `rgb(${red},${green},0)`,
			strokeOpacity: 1.0,
			strokeWeight: 3,
			zIndex: 10
		});
		poly.setMap(map);
		segmentLines.push(poly);
	});
	
	startMarker = new google.maps.Marker({
		position: directionsResultVar.routes[0].legs[0].start_location,
		map: map,
		icon: markerGen("A", "green"),
		title: directionsResultVar.routes[0].legs[0].start_address
	});
	startInfoWindow = new google.maps.InfoWindow({
		content: directionsResultVar.routes[0].legs[0].start_address
	});
	startMarker.addListener('click', function() {
		startInfoWindow.open(map, startMarker);
	});
	
	endMarker = new google.maps.Marker({
		position:  directionsResultVar.routes[0].legs[0].end_location,
		map: map,
		icon: markerGen("B", "red"),
		title: directionsResultVar.routes[0].legs[0].end_address
	});
	endInfoWindow = new google.maps.InfoWindow({
		content: directionsResultVar.routes[0].legs[0].end_address
	});
	endMarker.addListener('click', function() {
		endInfoWindow.open(map, endMarker);
	});

	focusOnRoute();
}

function focusOnRoute()
{
	let newBounds = new google.maps.LatLngBounds();
	segmentLines.forEach(v => {
		let path = v.getPath().getArray();
		newBounds.extend(path[0]);
		newBounds.extend(path[1]);
	});
	segmentSunLines.forEach(v => {
		let path = v.getPath().getArray();
		newBounds.extend(path[0]);
		newBounds.extend(path[1]);
	});
	map.fitBounds(newBounds);
}

function swapLocations()
{
	let temp = document.getElementById("startAddress").value;
	document.getElementById("startAddress").value = document.getElementById("endAddress").value;
	document.getElementById("endAddress").value = temp;
}

function toRad(x)
{
	return x * (Math.PI / 180);
}

function toDeg(x)
{
	return x / (Math.PI / 180);
}

//https://stackoverflow.com/a/18531494
function markerGen(label, color)
{
	let url = "https://mt.google.com/vt/icon/text=";
	url += label;
	url += "&psize=16&font=fonts/arialuni_t.ttf&color=ff330000&name=icons/spotlight/spotlight-waypoint-";
	url += color == "red" ? "b" : "a";
	url += ".png&ax=44&ay=48&scale=1";
	return url;
}