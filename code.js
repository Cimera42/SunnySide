let apiKey = "AIzaSyCJMRhIpOpG6RSPeaBkG_B4qrXDsH1Z3GI";
let map;
let startAutocomplete, endAutocomplete;

function init()
{
	setTime();
	document.getElementById("timeInput").disabled = !document.getElementById("timeCheckbox").checked;

	initMap();
}

function setTime()
{
	let n = nowTime();
	document.getElementById("timeInput").value = n;
}

function nowTime()
{
	let date = new Date();
	return ("00" + date.getHours()).slice(-2) + ":" + ("00" + date.getMinutes()).slice(-2);
}

function relTime(time)
{
	return new Date(new Date().toDateString() + " " + time)
}

function toggleTime(e)
{
	document.getElementById("timeInput").disabled = !e.target.checked;
}

const orsKey = '5b3ce3597851110001cf6248485a84fbf3f749b49ee6270b7df3751b';

function getParts(feature) {
	return {
		title: feature.properties.name,
		details: feature.properties.label,
	}
}

class Autocomplete {
	constructor(elem) {
		this.elem = elem;
		this.input = elem.querySelector('input');
		this.input.onkeydown = function(e) {
			switch(e.which) {
				case 40:
					if(this.listElem.firstChild) {
						this.listElem.firstChild.focus();
					}
					break;
			}
		}.bind(this);
		this.listElem = elem.querySelector('.autocomplete');
		this.listElem.setAttribute('tabindex', '-1');
		this.listElem.onkeydown = function(e) {
			switch(e.which) {
				case 38: case 40: e.preventDefault(); break;
			}
		}
		this.shouldShowList = false;
		this.hideList();
		this.loadingIcon = elem.querySelector('.loading-icon');

		this.input.onfocus = this.onfocus.bind(this);
		this.input.onblur = this.onblur.bind(this);
		this.input.oninput = this.oninput.bind(this);

		this.timeout = null;
		this.data = null;
		this.parsed = null;
		this.selected = null;
	}

	onfocus() {
		this.showList();
	}

	onblur(ev) {
		const text = ev.target.value.trim();

		// Set at end of stack to allow for
		// new element to be focused
		setTimeout(function() {
			const newFocus = document.activeElement;
			if(!this.elem.contains(newFocus)) {
				this.hideList();
				if(this.selected === null && text.length > 0) {
					this.input.classList.add('invalid');
				}
			}
		}.bind(this), 1);
	}

	clearTimeout() {
		clearTimeout(this.timeout);
		this.loadingIcon.removeAttribute('show');
	}

	oninput(ev) {
		this.selected = null;
		this.clearTimeout();
		this.input.classList.remove('invalid');

		const text = ev.target.value.trim();
		if(text.length) {
			this.showList();

			this.timeout = setTimeout(function() {
				this.loadingIcon.setAttribute('show', '');

				const mapCentre = map.getCenter();
				fetch(`https://api.openrouteservice.org/geocode/autocomplete?api_key=${orsKey}&text=${text}&focus.point.lon=${mapCentre.lng}&focus.point.lat=${mapCentre.lat}`).then(function(res) {
					return res.json();
				}).then(function(data) {
					this.clearTimeout();

					this.data = data;
					const d = data.features.map(function(v) {
						return getParts(v);
					});
					this.parsed = d;
					this.setList(d);
				}.bind(this));
			}.bind(this), 1000);
		} else {
			this.hideList();
			this.setList([]);
		}
	}

	select(index) {
		this.selected = index;
		this.hideList();

		this.input.value = this.parsed[this.selected].title;
		this.input.classList.remove('invalid');
	}

	setList(data) {
		while (this.listElem.firstChild) {
			this.listElem.removeChild(this.listElem.firstChild);
		}

		data.forEach(function(v, i) {
			const d = document.createElement('div');
			d.classList.add('result');
			d.onclick = function() {
				this.select(i);
			}.bind(this);
			d.onkeydown = function(ev) {
				switch(ev.which) {
					case 32: case 13:
						this.select(i);
						break;
					case 38:
						if(d.previousSibling) {
							d.previousSibling.focus();
						}
						break;
					case 40:
						if(d.nextSibling) {
							d.nextSibling.focus();
						}
						break;
				}
			}.bind(this);
			d.onblur = this.onblur.bind(this);
			d.setAttribute('tabindex', '0');

			const t = document.createElement('div');
			t.innerText = v.title;
			t.classList.add('title');

			const s = document.createElement('div');
			s.innerText = v.details;
			s.classList.add('details');

			d.appendChild(t);
			d.appendChild(s);

			this.listElem.appendChild(d);
		}.bind(this));

		if(this.shouldShowList) {
			this.showList();
		}
	}

	showList() {
		this.shouldShowList = true;
		if(this.listElem.firstChild) {
			this.listElem.style.display = null;
		}
	}

	hideList() {
		this.shouldShowList = false;
		this.listElem.style.display = 'none';
	}
}

function setupAutocomplete(id) {
	return new Autocomplete(document.getElementById(id));
}

function initMap()
{
	map = L.map('map', {
		center: {
			lat: -34.397,
			lng: 150.644
		},
		zoom: 8,
	});

	//Stamen.Watercolour
	//OpenStreetMap.Mapnik
	const mapTileLayer = L.tileLayer.provider('Wikimedia').addTo(map);
	const mapScale = L.control.scale().addTo(map);

	startAutocomplete = setupAutocomplete('startAddress');
	endAutocomplete = setupAutocomplete('endAddress');
}

let startTime, endTime, timeDiff;
let totalDuration, totalDistance;
let directionsResultVar;
let startMarker, endMarker;
let startPopup, endPopup;
let segments = [];
let segmentLines = [];
let segmentSunLines = [];
let leftTally = 0;
let rightTally = 0;
let routeStart, routeEnd;

const LON = 0;
const LAT = 1;

function doDirections()
{
	segments.length = 0;

	// let transitMode = document.querySelector(".transitModeButtons input:checked").value;

	const hasStart = startAutocomplete.selected !== null;
	const hasEnd = endAutocomplete.selected !== null;

	if(hasStart && hasEnd) {
		const start = startAutocomplete.data.features[startAutocomplete.selected].geometry.coordinates;
		const end = endAutocomplete.data.features[endAutocomplete.selected].geometry.coordinates;

		fetch(`https://api.openrouteservice.org/v2/directions/driving-car?api_key=${orsKey}&start=${start[LON]},${start[LAT]}&end=${end[LON]},${end[LAT]}`).then(function(res) {
			return res.json();
		}).then(function(data) {
			routeStart = startAutocomplete.data.features[startAutocomplete.selected];
			routeEnd = endAutocomplete.data.features[endAutocomplete.selected];
			directionResultCallback(data);
		}.bind(this));
	} else {
		if(!hasStart) {
			startAutocomplete.input.setAttribute('placeholder', 'Required');
			startAutocomplete.input.classList.add('invalid');
		} else {
			startAutocomplete.input.removeAttribute('placeholder');
			startAutocomplete.input.classList.remove('invalid');
		}

		if(!hasEnd) {
			endAutocomplete.input.setAttribute('placeholder', 'Required');
			endAutocomplete.input.classList.add('invalid');
		} else {
			endAutocomplete.input.removeAttribute('placeholder');
			endAutocomplete.input.classList.remove('invalid');
		}
	}

}

/*
 * Format distance as sensible output string
 * @param distance distance in meters
 */
function formatDistance(distance) {
	if(distance < 1000)
		return `${distance.toFixed(2)} m`
	else
		return `${(distance / 1000).toFixed(0)} km`;
}

/*
 * Format duration as sensible output string
 * @param duration duration in seconds
 */
function formatDuration(duration) {
	const hours = Math.floor(duration / 3600);
	const minutes = Math.floor((duration / 60) % 60);
	const seconds = Math.floor(duration % 60);

	let str = '';
	let sep = '';
	if(hours > 0) {
		str += `${sep}${hours} hr${hours === 1 ? 's' : ''}`;
		sep = ' ';
	}

	if(minutes > 0) {
		str += `${sep}${minutes} min${minutes === 1 ? 's' : ''}`;
		sep = ' ';
	}

	if(seconds > 0) {
		str += `${sep}${seconds} sec${seconds === 1 ? 's' : ''}`;
		sep = ' ';
	}

	return str;
}

function directionResultCallback(directionsResult)
{
	if(directionsResult)
	{
		const route = directionsResult.features[0];
		const leg = route.properties.segments[0];

		totalDistance = leg.distance;
		totalDuration = leg.duration;

		document.getElementById("routeDistance").innerText = formatDistance(totalDistance);
		document.getElementById("routeDuration").innerText = formatDuration(totalDuration);

		if(document.getElementById("timeCheckbox").checked)
			startTime = relTime(document.getElementById("timeInput").value).getTime();
		else
			startTime = new Date().getTime();
		endTime = startTime + (totalDuration * 1000);
		timeDiff = endTime - startTime;

		// ORS returns a massive number of route points, reduce them substantially
		const reduced = route.geometry.coordinates.filter(function(v, i) {
			return (i % 10) === 0;
		});

		let distanceTally = 0;
		let arrLength = reduced.length;
		for(let i = 0; i < arrLength-1; ++i)
		{
			let segment = {
				start: {
					lat: reduced[i][LAT],
					lon: reduced[i][LON],
				},
				end: {
					lat: reduced[i+1][LAT],
					lon: reduced[i+1][LON],
				}
			};
			segment.start.arr = [segment.start.lat, segment.start.lon];
			segment.end.arr = [segment.end.lat, segment.end.lon];

			segment.heading = coordBearing(segment.start, segment.end);
			segment.distancePrior = distanceTally;
			segment.distance = coordDistance(segment.start, segment.end);
			segment.startTime = startTime + ((segment.distancePrior / totalDistance) * timeDiff);
			segment.endTime = startTime + (((segment.distancePrior + segment.distance) / totalDistance) * timeDiff);
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
		segment.startTime = startTime + ((segment.distancePrior / totalDistance) * timeDiff);
		segment.endTime = startTime + (((segment.distancePrior + segment.distance) / totalDistance) * timeDiff);

		let sunData = SunCalc.getPosition(segment.startTime, segment.start.lat, segment.start.lon);
		let angle = sunData.azimuth - Math.PI/2;

		let lng = segment.start.lon + ((Math.cos(angle) * Math.cos(sunData.altitude)) / 50);
		let lat = segment.start.lat + ((Math.sin(angle) * Math.cos(sunData.altitude)) / 50);

		segment.sunPoint = {
			lat: lat,
			lon: lng,
			arr: [lat, lng],
		};
		segment.sunHeading = coordBearing(segment.start, segment.sunPoint);

		//left = +90
		//right = -90
		//-1 good -> 1 bad
		let side = isLeft ? 90 : -90;
		if(sunData.altitude >= 0)
		{
			segment.sunRating = Math.cos(toRad(segment.sunHeading - (segment.heading + side)));
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
		document.getElementById("resultText").innerText = "Doesn't matter what side you sit";
	}
	else if(leftTally > rightTally)
	{
		document.querySelector("input[value='left']").checked = true;
		document.getElementById("resultText").innerHTML = "You should sit on the <strong>left</strong>";
	}
	else
	{
		document.querySelector("input[value='right']").checked = true;
		document.getElementById("resultText").innerHTML = "You should sit on the <strong>right</strong>";
	}

	drawRoute();
}

function drawRoute()
{
	segmentLines.forEach(v => v.remove());
	segmentSunLines.forEach(v => v.remove());
	segmentLines.length = 0;
	segmentSunLines.length = 0;
	if(startMarker)
	{
		startMarker.remove();
		startMarker = null;
	}
	if(startPopup)
	{
		startPopup.remove();
		startPopup = null;
	}
	if(endMarker)
	{
		endMarker.remove();
		endMarker = null;
	}
	if(endPopup)
	{
		endPopup.remove();
		endPopup = null;
	}

	let side = (document.querySelector(".sideButtons input:checked") || {value:"left"}).value;

	segments.forEach(segment => {
		let sunRatingNormal = segment.sunRating;
		if(side === "right")
			sunRatingNormal *= -1;
		sunRatingNormal = (sunRatingNormal + 1) / 2;
		let red = 256 - (sunRatingNormal * 256);
		let green = sunRatingNormal * 256;

		let sunDir = new L.polyline([
			segment.start.arr,
			segment.sunPoint.arr,
		], {
			color: 'orange',
			weight: 1,
		}).addTo(map);
		segmentSunLines.push(sunDir);

		let poly = new L.polyline([
			segment.start,
			segment.end
		], {
			color: `rgb(${red},${green},0)`,
			weight: 3,
		}).addTo(map);
		segmentLines.push(poly);
	});

	const iconOptions = function(name) {
		return {
			iconUrl: `leaflet/images/${name}-marker-icon.png`,
			iconRetinaUrl: `leaflet/images/${name}-marker-icon-2x.png`,
			shadowUrl: `leaflet/images/marker-shadow.png`,
			iconSize: [25, 41],
			iconAnchor: [12, 41],
			popupAnchor: [1, -34],
			tooltipAnchor: [16, -28],
			shadowSize: [41, 41]
		};
	}

	const startIcon = L.icon(iconOptions('start'));
	const endIcon = L.icon(iconOptions('end'));
	startMarker = new L.marker(segments[0].start.arr, {
		title: routeStart.properties.label,
		icon: startIcon,
	}).addTo(map);
	endMarker = new L.marker(segments[segments.length-1].end.arr, {
		title: routeEnd.properties.label,
		icon: endIcon,
	}).addTo(map);

	startPopup = L.popup().setContent(routeStart.properties.label);
	startMarker.bindPopup(startPopup);

	endPopup = L.popup().setContent(routeEnd.properties.label);
	endMarker.bindPopup(endPopup);

	focusOnRoute();
}

function focusOnRoute()
{
	let newBounds = [];
	segments.forEach(v => {
		newBounds.push(v.start);
		newBounds.push(v.end);
	});
	map.fitBounds(newBounds);
}

function swapLocations()
{
	startAutocomplete.clearTimeout();
	endAutocomplete.clearTimeout();

	const temp = {
		value: startAutocomplete.input.value,
		data: startAutocomplete.data,
		parsed: startAutocomplete.parsed,
		selected: startAutocomplete.selected,
	}

	startAutocomplete.input.value = endAutocomplete.input.value;
	endAutocomplete.input.value = temp.value;

	startAutocomplete.data = endAutocomplete.data;
	endAutocomplete.data = temp.data;

	startAutocomplete.parsed = endAutocomplete.parsed;
	endAutocomplete.parsed = temp.parsed;

	startAutocomplete.selected = endAutocomplete.selected;
	endAutocomplete.selected = temp.selected;

	// Swap autocomplete lists
	const tempElem = document.createElement('div');
	while(startAutocomplete.listElem.firstChild)
		tempElem.appendChild(startAutocomplete.listElem.firstChild);
	while(endAutocomplete.listElem.firstChild)
		startAutocomplete.listElem.appendChild(endAutocomplete.listElem.firstChild);
	while(tempElem.firstChild)
		endAutocomplete.listElem.appendChild(tempElem.firstChild);

	doDirections();
}

function toRad(x)
{
	return x * (Math.PI / 180);
}

function toDeg(x)
{
	return x / (Math.PI / 180);
}

// https://www.movable-type.co.uk/scripts/latlong.html
function coordDistance(start, end) {
	const lon1 = start.lon;
	const lat1 = start.lat;
	const lon2 = end.lon;
	const lat2 = end.lat;

	var R = 6371e3; // metres
	var φ1 = toRad(lat1);
	var φ2 = toRad(lat2);
	var Δφ = toRad(lat2 - lat1);
	var Δλ = toRad(lon2 - lon1);

	var a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
			Math.cos(φ1) * Math.cos(φ2) *
			Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	var d = R * c;
	return d;
}

// https://www.movable-type.co.uk/scripts/latlong.html
function coordBearing(start, end) {
	const lon1 = start.lon;
	const lat1 = start.lat;
	const lon2 = end.lon;
	const lat2 = end.lat;

	var φ1 = toRad(lat1);
	var φ2 = toRad(lat2);
	var Δλ = toRad(lon2 - lon1);

	var y = Math.sin(Δλ) * Math.cos(φ2);
	var x = Math.cos(φ1) * Math.sin(φ2) -
			Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
	var brng = toDeg(Math.atan2(y, x));

	return brng;
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