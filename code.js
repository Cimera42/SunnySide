var map;

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
}

let startTime, endTime, timeDiff;
let totalDuration, totalDistance;
let segments = [];
let segmentLines = [];
let segmentSunLines = [];
let leftTally = 0;
let rightTally = 0;

function doDirections()
{
	segments.length = 0;

	let transitMode = document.querySelector("input[name='transitMode']:checked").value;

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
		totalDuration = directionsResult.routes[0].legs[0].duration.value;
		totalDistance = directionsResult.routes[0].legs[0].distance.value;

		if(!startTime)
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

	if(!startTime)
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
		segment.sunRating = Math.cos(toRad(segment.sunHeading-(segment.heading+side)));
		leftTally += segment.sunRating * (isLeft ? 1:-1);
		rightTally -= segment.sunRating * (isLeft ? 1:-1);
	});

	document.getElementById("leftData").textContent = leftTally.toFixed(2);
	document.getElementById("rightData").textContent = rightTally.toFixed(2);

	if(leftTally > rightTally)
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

	let side = document.querySelector("input[name='side']:checked").value;
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