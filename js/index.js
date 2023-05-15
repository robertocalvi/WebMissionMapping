"use strict";
import { Map, View } from 'ol';
import {Circle as CircleStyle, Fill, Icon, Stroke, Style} from 'ol/style';
import {Draw, Modify, Snap} from 'ol/interaction';
import {OSM, Vector, Vector as VectorSource, XYZ} from 'ol/source';
import {Tile as TileLayer, Vector as VectorLayer} from 'ol/layer';
import {get, project, Projection, useGeographic} from 'ol/proj';
import {Control, defaults as defaultControls, Rotate, ZoomSlider} from 'ol/control';
import {Geolocation} from 'ol';
import {Point, MultiPoint, Polygon, MultiPolygon, Circle} from 'ol/geom';
import saveAs from 'file-saver';
import proj4 from 'proj4';
import Collection from 'ol/Collection';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import {Select as SelectInteraction} from 'ol/interaction';
//import {rectangleGrid} from '@turf/rectangle-grid';
import RotateFeatureInteraction from 'ol-rotate-feature';
import {writeFeaturesObject, readFeatures} from 'ol/format/GeoJSON';
import * as $ from 'jquery';
import Overlay from './Overlay'; //edited by me to remove transition delay in toggle
import Toggle from 'ol-ext/control/Toggle';
import { rotate } from 'ol/transform';
import { featureCollection, point } from '@turf/turf';
import { Projection } from 'ol/proj';

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
//import OverlayPositioning from 'ol/OverlayPositioning';

const firebaseConfig = {
    apiKey: "AIzaSyCOJnQfm4soMiCUhxhPcC36dndRoCJNaIE",
    authDomain: "drods-23779.firebaseapp.com",
    projectId: "drods-23779",
    storageBucket: "drods-23779.appspot.com",
    messagingSenderId: "188910661133",
    appId: "1:188910661133:web:a1b5a25b6ccc2420d3ef44",
    measurementId: "G-WB7RS4GR5Y"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

async function init() {
    //useGeographic(); double transforms 4326

    function Camera(sensorWidth, focalLength, imageWidth, imageHeight) {
        this.sensorWidth = sensorWidth;
        this.focalLength = focalLength;
        this.imageWidth = imageWidth;
        this.imageHeight = imageHeight;
    }

    let camera = new Camera(6.17, 4.49, 4000, 3000);

    

    let firstAndLastLineDistance;
    let traverseDistance = 0;
    let timeTravel = 0;
    let totalPhotoCount = 0;
    let waypointFrequency = 1;
    let firstLineHeading;
    let gridPointsCollection;
    let stopPointCollection;
    let drawnAoIMercator;
    let areaAcres;
    let areaHectares;

    let drawingActive = false;

    // flight settings section
    let currentCamera = 'DJI Mini 2';
    let drawnHomePoint = null;
    let homePointWgs84 = null;
    let currentRotation = 0;
    let currentGsd = 3000;
    let currentNudge = 0;
    let currentSidelap = 700;
    let currentFrontlap = 400;
    let currentSpeed = 30;
    let sensorWidth = camera.sensorWidth;
    let focalLength = camera.focalLength;
    let imageWidth = camera.imageWidth;
    let imageHeight = camera.imageHeight;
    let frontlapMetres = (currentGsd/1000 * imageHeight)/100; //base value of how much of the earth is captured in the photo
    let frontlapSpacing = frontlapMetres*(1-currentFrontlap/1000); //how much of the earth is captured in the photo * frontlap percentage
    let currentGimbal = -90;
    let photoLayerOn = 0;
    let multiPolarity = 1; // flips direction after each line

    const turf = require('@turf/turf');
    const rectangleGrid = require('@turf/rectangle-grid').default;

    let satelliteImagery = false;
    function handleSatellite() {
        if (satelliteImagery) {
            satelliteImagery = false;
            map.removeLayer(raster);
            map.addLayer(osmRaster);
        } else {
            satelliteImagery = true;
            map.removeLayer(osmRaster);
            map.addLayer(raster);
        }
    }

    function lineWidthSeparation(currentGsd, imageWidth, currentSidelap) {
        let imageWidthInMetres = ((currentGsd/1000)*(imageWidth/100)); // ((3250/1000)*(4000/100)) = 130m on flat ground
        let separationDistance = imageWidthInMetres * (1-(currentSidelap/1000)); // 130 * (500/1000) = 65 || 130 * (1-(700/1000)) = 39m separation
        //let pixels = ((currentGsd/1000*imageWidthInMetres)*(1-(currentSidelap/1000))/(currentGsd/1000)); // ((1 * 40) * (1 - 0.5))/1 = 20
        //let degrees = turf.lengthToDegrees(pixels, 'metres');
        //console.log(pixels, 'pixels');
        //console.log(`Photo distance on ground: GSD[${currentGsd/1000}] * WidthPixels[${imageWidth}] = ${imageWidthInMetres}m`);
        let degrees = turf.lengthToDegrees(separationDistance, 'metres');
        //console.log(`Line separation distance: Sidelap of ${currentSidelap/10}% with photo size gives separation distance of ${separationDistance}m = ${degrees} degrees`);
        //console.log(currentGsd, 'currentGsd');
        //console.log(imageWidth, 'imageWidth');
        //console.log(currentSidelap, 'currentSidelap');
        return degrees;
    }

    function frontlapDistance(collection) {
        let totalPhotoCount = collection.features.length;
        let pointCollection = turf.featureCollection([]);
        let stopPointCollection = turf.featureCollection([]);
        frontlapMetres = (currentGsd/1000 * imageHeight)/100; //base value of how much of the earth is captured in the photo
        frontlapSpacing = frontlapMetres*(1-currentFrontlap/1000); //how much of the earth is captured in the photo * frontlap percentage
        
        for (let i = 0; i < collection.features.length; i++) {
            let n = 0;
            let length = turf.length(collection.features[i], {units: 'metres'});
            if (length > frontlapSpacing) {
                //let startpoint = turf.along(collection.features[i], 0, {units: 'metres'});
                //stopPointCollection.features.push(startpoint);
                //create points at every frontlapSpacing until length is reached
                for (let j = 0; j < length-0.6; j+=frontlapSpacing) { // 0.6 is to prevent Litchi/DJI error of points being less than 0.5m apart (happens at end of line)
                    let point = turf.along(collection.features[i], j, {units: 'metres'});
                    pointCollection.features.push(point);
                    if (n % waypointFrequency === 0 && waypointFrequency !== 0) {
                        let stopPoint = turf.along(collection.features[i], j, {units: 'metres'});
                        stopPointCollection.features.push(stopPoint);
                    }
                    n++;
                    totalPhotoCount++;
                }
                let endpoint = turf.along(collection.features[i], length, {units: 'metres'});
                stopPointCollection.features.push(endpoint);
                pointCollection.features.push(endpoint);
            } else {
                let point = turf.along(collection.features[i], 0, {units: 'metres'});
                pointCollection.features.push(point);
                stopPointCollection.features.push(point);
                let endpoint = turf.along(collection.features[i], length, {units: 'metres'});
                stopPointCollection.features.push(endpoint);
                pointCollection.features.push(endpoint);
            }
        }
        photoTally.innerHTML = `📷: ~${totalPhotoCount}, (${parseFloat(frontlapSpacing).toFixed(2)}m/${parseFloat(frontlapSpacing*3.28084).toFixed(2)}ft)`;
        //console.log(frontlapMetres, 'photoHeight');
        //console.log(frontlapSpacing, 'metres per photo');
        //console.log(pointCollection);
        //console.log(`Total photos: ${totalPhotoCount}`);
        return [pointCollection, stopPointCollection];
    }

    let sidelapDistance = lineWidthSeparation(currentGsd, imageWidth, currentSidelap);
    //console.log(sidelapDistance, 'sidelapDistance');

    function getHeight(currentGsd, sensorWidth, focalLength, imageWidth) {
        let heightInMetres = currentGsd/1000/(sensorWidth/(focalLength*imageWidth))/100;
        return heightInMetres;
    }

    let heightOffset = getHeight(currentGsd, camera.sensorWidth, camera.focalLength, camera.imageWidth);

    function getDistance(currentGsd, sensorWidth, focalLength, imageWidth) {
        let distanceInMetres = (currentGsd/1000*imageWidth)/100;
        return distanceInMetres;
    }

    ////////////////        Export To Litchi
    //create csv template

    function createDistanceCsvFile(homePointWgs84, collection) {
        //console.log(collection, 'collection');
        if (drawnAoI && drawnHomePoint) {
            let header = 'latitude;longitude;altitude(m);heading(deg);curvesize(m);rotationdir;gimbalmode;gimbalpitchangle;actiontype1;actionparam1;actiontype2;actionparam2;actiontype3;actionparam3;actiontype4;actionparam4;actiontype5;actionparam5;actiontype6;actionparam6;actiontype7;actionparam7;actiontype8;actionparam8;actiontype9;actionparam9;actiontype10;actionparam10;actiontype11;actionparam11;actiontype12;actionparam12;actiontype13;actionparam13;actiontype14;actionparam14;actiontype15;actionparam15;altitudemode;speed(m/s);poi_latitude;poi_longitude;poi_altitude(m);poi_altitudemode;photo_timeinterval;photo_distinterval\n';
            let greenPoint = `${homePointWgs84.geometry.coordinates[1]};${homePointWgs84.geometry.coordinates[0]};${heightOffset.toFixed(4)};${firstLineHeading};0.2;0;0;${currentGimbal};5;${currentGimbal};-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;0;0;0;0;0;-1;-1\n`;
            let csvFile = header + greenPoint;
            let firstTwoPhotosBearing = Math.round((turf.bearing([collection.features[0].geometry.coordinates[0], collection.features[0].geometry.coordinates[1]], [collection.features[1].geometry.coordinates[0], collection.features[1].geometry.coordinates[1]])+360))%360;
            let lastTwoPhotosBearing = Math.round((turf.bearing([collection.features[collection.features.length-2].geometry.coordinates[0], collection.features[collection.features.length-2].geometry.coordinates[1]], [collection.features[collection.features.length-1].geometry.coordinates[0], collection.features[collection.features.length-1].geometry.coordinates[1]])+360))%360;           
            //console.log(firstTwoPhotosBearing, 'firstTwoPhotosBearing');
            //console.log(firstDirection, 'firstDirection');
            for (let i = 0; i < collection.features.length; i++) {
                let thisPoint = turf.point(collection.features[i].geometry.coordinates);
                //console.log("%cPoint:", "color: #aa0000");
                //console.log(`${i} of ${collection.features.length}`);
                if (i+1 < collection.features.length) { //do this for every point except the last one
                let thisBearing = parseInt(Math.round((turf.bearing([collection.features[i].geometry.coordinates[0], collection.features[i].geometry.coordinates[1]], [collection.features[i+1].geometry.coordinates[0], collection.features[i+1].geometry.coordinates[1]])+360))%360);
                //console.log(parseInt(Math.round(turf.bearing([collection.features[i].geometry.coordinates[0], collection.features[i].geometry.coordinates[1]], [collection.features[i+1].geometry.coordinates[0], collection.features[i+1].geometry.coordinates[1]])), 'bearing geom check'));
                //console.log("%cBearing:", "color: #00aa00");
                //console.log(`${thisBearing} degrees from point ${i} to point ${i+1}`);
                    if (thisBearing%360 == firstTwoPhotosBearing) { //if on line with heading direction (LINE A)
                        //console.log("%cLine A:", "color: #ff00ff");
                        if (waypointFrequency == 1) { //if there's a waypoint every photo
                            csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${thisBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;-1;-1\n`;
                            } else {
                                //if it's an older phantom model, we need to take photos by time instead of distance due to hardware limitations
                                if (currentCamera.indexOf('Phantom') > -1) {
                                    csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${thisBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;${parseFloat((frontlapSpacing/(currentSpeed/10)).toFixed(2))};-1\n`;  ////////////up to here  
                                    //console.log(frontlapSpacing/(currentSpeed/10), 'frontlapSpacing/currentSpeed');                          
                                } else {
                                csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${thisBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;-1;${frontlapSpacing}\n`;
                                //console.log("%cPushed with photo spacing:", "color: #aa00aa");
                                }
                            }    
                            } else { //if on line with potentially alternate direction (LINE B)
                            //console.log("%cLine B:", "color: #ff00ff");
                            let previousBearing = parseInt(Math.round((turf.bearing([collection.features[i-1].geometry.coordinates[0], collection.features[i-1].geometry.coordinates[1]], [collection.features[i].geometry.coordinates[0], collection.features[i].geometry.coordinates[1]])+360))%360);
                            //console.log("%cPrevious Bearing:", "color: #0000ff");
                            //console.log(previousBearing);
                            //let flipBearing = parseInt(Math.round((turf.bearing([collection.features[0].geometry.coordinates[0], collection.features[0].geometry.coordinates[1]], [collection.features[1].geometry.coordinates[0], collection.features[1].geometry.coordinates[1]])+180))%360);
                            //let flipBearing;
                            //if (multiPolarity == 1) {
                            //    flipBearing = parseInt(Math.round((turf.bearing([collection.features[0].geometry.coordinates[0], collection.features[0].geometry.coordinates[1]], [collection.features[1].geometry.coordinates[0], collection.features[1].geometry.coordinates[1]])+180))%360);
                            //} else {
                            //    flipBearing = firstTwoPhotosBearing;
                            //}
                            let flipBearing = parseInt(Math.round((turf.bearing([collection.features[0].geometry.coordinates[0], collection.features[0].geometry.coordinates[1]], [collection.features[1].geometry.coordinates[0], collection.features[1].geometry.coordinates[1]])+180))%360);

                            if (previousBearing == firstTwoPhotosBearing) {
                                //if (previousBearing != flipBearing) {
                                    //console.log(`previousBearing ${previousBearing} is equal to firstTwoPhotosBearing ${firstTwoPhotosBearing}`);
                                //end the line on the same bearing as the first two photos
                                csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${firstTwoPhotosBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;-1;-1\n`;
                                //console.log("%cPushed without photo spacing:", "color: #000000");
                            } else {
                            //flip the bearing and start the next line
                            if (waypointFrequency == 1) {
                                if (multiPolarity == 1) {
                                    csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${flipBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;-1;-1\n`;
                                    } else {
                                    csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${firstTwoPhotosBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;-1;-1\n`;
                                    }
                                } else {
                                    if (currentCamera.indexOf('Phantom') > -1) {
                                        if (thisBearing != flipBearing) {
                                            if (multiPolarity == 1) {
                                            csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${flipBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;-1;-1\n`;
                                            } else {
                                            csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${firstTwoPhotosBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;-1;-1\n`;
                                            }
                                            //console.log("%cPushed without photo spacing:", "color: #00ffff");
                                        } else {
                                            if (multiPolarity == 1) {
                                            csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${flipBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;${parseFloat((frontlapSpacing/(currentSpeed/10)).toFixed(2))};-1\n`;
                                            } else {
                                            csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${firstTwoPhotosBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;${parseFloat((frontlapSpacing/(currentSpeed/10)).toFixed(2))};-1\n`;
                                            }
                                            //console.log("%cPushed with photo spacing:", "color: #0000ff");
                                        }
                                    } else {
                                        if (thisBearing != flipBearing) {
                                            if (multiPolarity == 1) {
                                                csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${flipBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;-1;-1\n`;
                                                } else {
                                                csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${firstTwoPhotosBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;-1;-1\n`;  
                                                }
                                                //console.log("%cPushed without photo spacing:", "color: #00ff00");
                                        } else {
                                            if (multiPolarity == 1) {
                                                csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${flipBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;-1;${frontlapSpacing}\n`;
                                                } else {
                                                csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${firstTwoPhotosBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;${currentSpeed/10};0;0;0;0;-1;${frontlapSpacing}\n`;
                                                }
                                                //console.log("%cPushed with photo spacing:", "color: #ffff00");
                                        }
                                }
                            }
                        }

                        //thisBearing = (thisBearing + 180)%360;
                        //console.log(thisBearing, 'thisBearing B');
                    }
                } else { // this is the last point
                    //console.log(`Last point ${i} of ${collection.features.length}`);
                    //let thisBearing = parseInt(Math.round((turf.bearing([collection.features[i].geometry.coordinates[0], collection.features[i].geometry.coordinates[1]], [collection.features[i-1].geometry.coordinates[0], collection.features[i-1].geometry.coordinates[1]])+360))%360);
                    if (multiPolarity == 1) {
                    csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${lastTwoPhotosBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;5;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;0;0;0;0;0;-1;-1\n`;
                    } else {
                    csvFile += `${thisPoint.geometry.coordinates[1]};${thisPoint.geometry.coordinates[0]};${heightOffset.toFixed(4)};${firstTwoPhotosBearing};0.2;0;0;${currentGimbal};5;${currentGimbal};1;0;5;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;-1;0;1;0;0;0;0;0;-1;-1\n`;
                    }
                    //console.log(thisBearing, 'thisBearing C');
                }
            }
            //console.log(endPoints);
              return csvFile;
        }
    }

    function togglePhotoLayer() {
        if (photoLayerOn == 1) {
            photoLayerOn = 0;
            map.removeLayer(photosLayer);
            document.querySelector("#map > div > div.ol-overlaycontainer-stopevent > div.photo-layer.ol-selectable.ol-control > button").innerHTML = '🌚';
        } else {
            photoLayerOn = 1;
            map.removeLayer(photosLayer);
            map.addLayer(photosLayer);
            document.querySelector("#map > div > div.ol-overlaycontainer-stopevent > div.photo-layer.ol-selectable.ol-control > button").innerHTML = '🌝';
        }
    }

    function flipDirection() {
        if (multiPolarity == 1) {
            multiPolarity = 0;
            document.querySelector("#map > div > div.ol-overlaycontainer-stopevent > div.direction.ol-selectable.ol-control > button").innerHTML = '⬆️';
            //do lawn mower flipping directions
            if (drawnAoI) {lawnMowerPattern(currentRotation, camera)};
        } else {
            multiPolarity = 1;
            document.querySelector("#map > div > div.ol-overlaycontainer-stopevent > div.direction.ol-selectable.ol-control > button").innerHTML = '🔃';
            //do lawn mower without flipping directions
            if (drawnAoI) {lawnMowerPattern(currentRotation, camera)};
        }
    }

    
    function geolocate() {
        const geolocation = new Geolocation({
            tracking: true,
            trackingOptions: {
                enableHighAccuracy: true
            },
            projection: map.getView().getProjection()
        });

        async function success(position) {
            const coordinates = geolocation.getPosition();
            map.getView().animate({
                center: coordinates,
                zoom: 18,
                duration: 1000
            })
            //map.getView().setCenter(coordinates);
            //map.getView().setZoom(18);
            geolocation.setTracking(false);
        }

        geolocation.on('change', success);
    }

    function saveCSV() {
        let interestingPoints;
        if (drawnHomePoint && gridPointsCollection) {
        if (waypointFrequency != 0) { // ??? it's never 0 the way it's set up at the moment I think this is a relic from when I was trying to make it work with the old way of doing things
        interestingPoints = frontlapDistance(gridPointsCollection)[1];
        } else {
        interestingPoints = frontlapDistance(gridPointsCollection)[0];
        }
        //console.log(interestingPoints, 'interestingPoints');
        let csv = createDistanceCsvFile(homePointWgs84, interestingPoints);
        let d = new Date();
        let months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let date = months[d.getMonth()] + d.getDate();
        let name = `LitchiMission${date}.csv`;
        //console.log(csv, 'csv');
        let blob = new Blob([csv], {type: "text/plain;charset=utf-8"});
        //console.log(blob, 'blob');
        saveAs(blob, name);
        //console.log(drawnHomePoint, 'drawnHomePoint');
        //console.log(newGridPointCollection, 'newGridPointCollection');
        } else {
            //console.log(drawnHomePoint, 'drawnHomePoint');
            //console.log(newGridPointCollection, 'stopPointCollection');
        alert('Please draw a home point and an area of interest');
        }
    }


    // end device settings section

    const stopPointsSource = new VectorSource({
        features: [],
        useSpatialIndex: false
    })

    const stopPointsLayer = new VectorLayer({
        source: null,
        style: new Style({
            image: new CircleStyle({
                radius: 4,
                fill: new Fill({
                    color: 'rgba(255, 128, 0, 1)',
                }),
                stroke: new Stroke({
                    color: 'rgba(0, 0, 0, 0.5)',
                    width: 2
                })
            }),
        }),
        zIndex: 115,
    });

    const photoPointsSource = new VectorSource({
        features: [],
        useSpatialIndex: false,
    });

    const photoPointsLayer = new VectorLayer({
        source: null,
        style: new Style({
            image: new CircleStyle({
                radius: 2.5,
                fill: new Fill({
                    color: 'rgba(255, 255, 0, 0.8)',
                }),
            })
        }),
        zIndex: 100,
    });

    const firstAndLastLinesSource = new VectorSource({
        features: [],
        useSpatialIndex: false
    });

    const firstAndLastLinesLayer = new VectorLayer({
        source: null,
        style: new Style({
            stroke: new Stroke({
                color: 'rgba(0, 200, 0, 0.8)',
                width: 3,
            })
        }),
        zIndex: 115,
    });

    const gridLinesSource = new VectorSource({
        features: [],
        useSpatialIndex: false
    });

    const gridLinesLayer = new VectorLayer({
        source: null,
        style: new Style({
            stroke: new Stroke({
                color: 'rgba(255, 255, 0, 0.8)',
                width: 2                
            })
        }),
        zIndex: 109
    });


    const drawnAoILayer = new VectorLayer({
        source: null,
        style: new Style({
            image: new CircleStyle({
                radius: 3,
                fill: new Fill({
                    color: 'rgba(255, 255, 255, 0.8)'
                })
            }),
            fill: new Fill({
                color: 'rgba(0, 0, 0, 0.15)'
            }),
            stroke: new Stroke({
                color: 'rgba(255, 0, 255, 0.3)',
                width: 3
            }),
        }),
        zIndex: 110,
    });

    const drawnHomePointLayer = new VectorLayer({
        source: null,
        style: new Style({
            image: new CircleStyle({
                radius: 7,
                fill: new Fill({
                    color: 'rgba(0, 255, 0, 0.7)'
                }),
                stroke: new Stroke({
                    color: 'rgba(0, 0, 0, 0.7)',
                    width: 2
                })
            }),
        }),
        zIndex: 120,
    });

    const drawnHomePointSource = new VectorSource({
        features: [],
        useSpatialIndex: false
    });

    const drawnAoISource = new VectorSource({
        features: [],
        useSpatialIndex: false
    });

    const drawnAoIVerticesLayer = new VectorLayer({
        source: null,
        zIndex: 103,
        style: new Style({
            image: new CircleStyle({
                radius: 5.5,
                fill: new Fill({
                    color: 'rgba(255, 0, 255, 0.50)'
                }),
                stroke: new Stroke({
                    color: 'rgba(255, 0, 255, 1)',
                })
            }),
        })
    });

    const drawnAoIVerticesSource = new VectorSource({
        features: [],
        useSpatialIndex: false
    });

    const firstPointLayer = new VectorLayer({
        source: null,
        style: new Style({
            image: new CircleStyle({
                radius: 9,
                fill: new Fill({
                    color: 'rgba(255, 128, 0, 1)',
                }),
                stroke: new Stroke({
                    color: 'rgba(0, 0, 0, 1)',
                    width: 2
                })
            }),
        }),
        zIndex: 120,
    });

    const firstPointSource = new VectorSource({
        features: [],
        useSpatialIndex: false
    });

    const lastPointLayer = new VectorLayer({
        source: null,
        style: new Style({
            image: new CircleStyle({
                radius: 9,
                fill: new Fill({
                    color: 'rgba(255, 0, 0, 0.8)',
                }),
                stroke: new Stroke({
                    color: 'rgba(0, 0, 0, 1)',
                    width: 2
                })
            }),
        }),
        zIndex: 117,
    });

    const lastPointSource = new VectorSource({
        features: [],
        useSpatialIndex: false
    });



    const bufferLayer = new VectorLayer({
        source: null,
        style: new Style({
            stroke: new Stroke({
                color: 'rgba(255, 0, 0, 0.7)',
                width: 2
            }),
            fill: new Fill({
                color: 'rgba(0, 0, 0, 0.2)'
            })
        })
    });


    //layer for the buffer polygon to clip the rectangle grid
    const bufferSource = new VectorSource({
            features: [],
            useSpatialIndex: false
    });

    const rectangleGridLayer = new VectorLayer({
        source: null,
        style: new Style({
            stroke: new Stroke({
                color: 'rgba(0, 80, 0, 0.4)',
                width: 2
            }),
            fill: new Fill({
                color: 'rgba(0, 80, 0, 0.15)'
            })
        })
    });

    //layer for the rectangle grid which the user rotates
    const rectangleGridSource = new VectorSource({
            features: [],
            projection: 'EPSG:4326',
            useSpatialIndex: false
    });

    const gridPointsLayer = new VectorLayer({
        source: null,
        fill: new Fill({
            color: 'rgba(0, 0, 0, 0.2)'
        }),
        style: new Style({
            image: new CircleStyle({
                radius: 4,
                fill: new Fill({
                    color: 'rgba(0, 0, 0, 0.6)'
                })
            }),
            stroke: new Stroke({
                color: 'rgba(0, 0, 0, 0.7)',
                width: 1          
            }),
        }),
        zIndex: 118,
    });

    //layer where the points are stored
    const gridPointsSource = new VectorSource({
            features: null,
            useSpatialIndex: false,
    });

    const lineLayer = new VectorLayer({
        source: null,
        style: new Style({
            stroke: new Stroke({
                color: 'rgba(255, 255, 0, 0.7)',
                width: 2
            })
        }),
        zIndex: 6
    });

    const lineSource = new VectorSource({
            features: null,
            useSpatialIndex: false
    });

    const photosLayer = new VectorLayer({
        source: null,
        //style: new Style({
        //    fill: new Fill({
        //        color: 'rgba(255, 255, 255, 0.04)',
        //    }),
        //    stroke: new Stroke({
        //        color: 'rgba(0, 0, 0, 0.25)',
        //        width: 1
        //    }),
        //}),
        zIndex: 108
    });

    const photosSource = new VectorSource({
            features: null,
            useSpatialIndex: false
    });
    

    let drawnAoI;

    //cool functions section//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //put drawnAoI into a vector layer
    function addDrawnAoI() {
        map.removeLayer(drawnAoILayer);
        map.removeLayer(drawnAoIVerticesLayer);
        drawnAoISource.clear()
        drawnAoIVerticesSource.clear()
        let drawnAoIMercator = turf.toMercator(drawnAoI);
        //console.log(drawnAoI, 'drawnAoI');
        //console.log(drawnAoIMercator, 'drawnAoIMercator');
        let vertices = turf.explode(drawnAoI);
        let verticesMercator = turf.explode(turf.toMercator(drawnAoI));
        //console.log(vertices, 'vertices');
        //console.log(verticesMercator, 'verticesMercator');
        drawnAoISource.addFeatures(new GeoJSON().readFeatures(drawnAoIMercator));
        drawnAoILayer.setSource(drawnAoISource);
        drawnAoIVerticesSource.addFeatures(new GeoJSON().readFeatures(verticesMercator));
        drawnAoIVerticesLayer.setSource(drawnAoIVerticesSource);
        map.addLayer(drawnAoILayer);
        map.addLayer(drawnAoIVerticesLayer);
        lawnMowerPattern(currentRotation, camera);
    }

    //put drawnHomePoint into a vector layer
    function addDrawnHomePoint() {
        map.removeLayer(drawnHomePointLayer);
        drawnHomePointSource.clear()
        drawnHomePointSource.addFeature(new GeoJSON().readFeature(drawnHomePoint));
        drawnHomePointLayer.setSource(drawnHomePointSource);
        map.addLayer(drawnHomePointLayer);
    }


    //let drawnAoIOnMap = new VectorLayer({
    //    source: new VectorSource({
    //        features: [new Feature({
    //            geometry: new Polygon(
    //                drawnAoI.geometry.coordinates,
    //            ),
    //        })],
    //    }),
    //    style: new Style({
    //        fill: new Fill({
    //            color: 'rgba(0, 0, 0, 0.2)',
    //        }),
    //        stroke: new Stroke({
    //            color: 'rgba(0, 0, 0, 0.5)',
    //            width: 2,
    //        }),
    //    }),
    //});
    //map.addLayer(drawnAoIOnMap);

    //function that doubles the size of a bbox
    function doubleBbox(bbox) {
        let newBbox = [];
        newBbox.push(bbox[0] - (bbox[2] - bbox[0])*2);  
        newBbox.push(bbox[1] - (bbox[3] - bbox[1])*2);
        newBbox.push(bbox[2] + (bbox[2] - bbox[0])*2);
        newBbox.push(bbox[3] + (bbox[3] - bbox[1])*2);
        return newBbox;
    }

    //store coords as GEOJSON
    function exportToTextFile(coords) {
        let geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            coords
                        ]
                    }
                }
            ]
        };
        let blob = new Blob([JSON.stringify(geojson)], {type: 'text/plain;charset=utf-8'});
        saveAs(blob, 'polygon.geojson');
    }

    //export an array to a text file
    function exportToTextFile(input) {
        let dataString = JSON.stringify(input);
        let filename = "data.json";
        let blob = new Blob([dataString], {type: "text/plain;charset=utf-8"});
        saveAs(blob, filename);
    }


    ////convert an array of 3857 coordinates to an array of 4326 coordinates
    //function convert3857to4326(coords) {
    //    let newCoords = [];
    //    for( let i = 0; i < coords.length; i++) {
    //        newCoords.push(proj4('EPSG:3857', 'EPSG:4326', coords[i]));
    //    }
    //    return newCoords;
    //}
//
    ////convert object from 4326 to 3857
    //function convert4326to3857(coords) {
    //    let newCoords = [];
    //    for( let i = 0; i < coords.length; i++) {
    //        newCoords.push(proj4('EPSG:4326', 'EPSG:3857', coords[i]));
    //    }
    //    return newCoords;
    //}

    //shifts the lines by 2 metres in any direction
    function shiftLines(direction) {
        newRectangleGridRotating = turf.transformTranslate(newRectangleGridRotating, 2, direction, {units: 'metres', mutate: true});
        lawnMowerPattern(currentRotation, camera);
    }

    function toggleDraw() {      
        //map.removeLayer(vector);
        source.clear();
        map.removeLayer(drawnAoILayer);
        map.removeLayer(drawnAoIVerticesLayer);
        drawnAoISource.clear();
        drawnAoIVerticesSource.clear();

        drawnAoI = [];
        let coords = [];
        source.clear();
        let draw = new Draw({
            source: source,
            type: 'Polygon',
            geometryName: 'poly'
        });

        let snap = new Snap({
            source: source, 
            vertex: true, 
            edge: false, 
            pixelTolerance: 20
        });

        //remove draw interaction after polygon closes
        draw.on('drawend', function(e) {
            source.clear();
            map.removeInteraction(draw);
            map.removeInteraction(snap);
            drawingActive = false;
            //console.log('drawing ended');
        });

        modify.on('modifyend', function(e) {
            const features = e.features;
            const coords = features.getArray()[0].getGeometry().getCoordinates()[0];
            //console.log(coords);
            //drawnAoI = turf.polygon([coords]);
            drawnAoI = turf.toWgs84(turf.polygon([coords]));
            //console.log(drawnAoI, 'drawnAoICHECK');
            drawnAoIMercator = turf.toMercator(drawnAoI);
            //turf.toMercator(drawnAoI, {mutate: true});
            if (turf.area(drawnAoI) > 5000000) {
                alert('Area too large. Please draw a smaller area.');
                source.clear();
                drawnAoI = [];
            } else {
            addDrawnAoI();
            lawnMowerPattern(currentRotation, camera);
            areaHectares = parseFloat((turf.area(drawnAoI)/10000));
            areaAcres = parseFloat((areaHectares * 2.47105));
            //console.log(areaHectares, 'areaHectares');
            //console.log(areaAcres, 'areaAcres');
            aoiArea.innerHTML = `🔳: ${areaAcres.toFixed(1)}ac | ${areaHectares.toFixed(1)}ha`; 
            }
            drawingActive = false;
        });
        
        //log coordinates of polygon when it is closed
        draw.on('drawend', function(e) {
            for(let i = 0; i < e.feature.getGeometry().getCoordinates()[0].length; i++) {
                coords.push((e.feature.getGeometry().getCoordinates()[0][i]));
            }
            //console.log(coords);
            drawnAoI = turf.toWgs84(turf.polygon([coords]));
            if (turf.area(drawnAoI) > 5000000) {
                alert('Area too large. Please draw a smaller area.');
                drawnAoI = [];
                coords = [];
                source.clear();
                drawingActive = false;
            } else {
            //console.log(drawnAoI);
            addDrawnAoI();
            drawingActive = false;
            areaHectares = parseFloat((turf.area(drawnAoI)/10000));
            areaAcres = parseFloat((areaHectares * 2.47105));
            //console.log(areaHectares, 'areaHectares');
            //console.log(areaAcres, 'areaAcres');
            aoiArea.innerHTML = `🔳: ${areaAcres.toFixed(1)}ac | ${areaHectares.toFixed(1)}ha`;          
            return coords;
            }
        });

        if(drawingActive === false) {
            map.addInteraction(draw);
            map.addInteraction(snap);
            //console.log('drawing');
        }  
    }

    function drawHomePoint() {
        //drawnHomePoint = [];
        let coords = [];
        drawnHomePointSource.clear();
        let drawing = false;
        let homePoint = new Draw({
            source: drawnHomePointSource,
            type: 'Point',
            geometryName: 'homePoint'
        });

        let snap = new Snap({
            source: drawnHomePointSource, 
            vertex: true,
            pixelTolerance: 20
        });

        homePoint.on('drawend', function(e) {
            drawnHomePoint = turf.point(e.feature.getGeometry().getCoordinates());
            homePointWgs84 = turf.toWgs84(drawnHomePoint);
            map.removeInteraction(homePoint);
            map.removeInteraction(snap);
            //console.log(drawnHomePoint, 'home point drawn');
            addDrawnHomePoint();
            if (drawnAoI) {
                lawnMowerPattern(currentRotation, camera);
            }
        });

        if(drawing === false) {
            map.addInteraction(homePoint);
            map.addInteraction(snap);
            //console.log('drawing');
        }

        modifyHomePoint.on('modifyend', function(e) {
            const features = e.features;
            //console.log(features, 'features');
            const coords = features.getArray()[0].getGeometry().getCoordinates();
            //console.log(coords, 'home point coords');
            drawnHomePoint = turf.point(coords);
            homePointWgs84 = turf.toWgs84(drawnHomePoint);
            //console.log(drawnHomePoint, 'home point drawn');
            //console.log(homePointWgs84, 'home point wgs84');
            addDrawnHomePoint();
            
            if (drawnAoI != undefined) {
            lawnMowerPattern(currentRotation, camera);
            totalDistance.innerHTML = `📐: ${((traverseDistance+firstAndLastLineDistance)/1000).toPrecision(3)}km | ${(((traverseDistance+firstAndLastLineDistance)*3.28084)*0.000189394).toPrecision(3)}mi`;
            minTime.innerHTML = `🕓 > ${Math.ceil((((traverseDistance+firstAndLastLineDistance)/(currentSpeed/10))/60)*1.5)+2}min`; //+2 for takeoff and landing, 1.5* for variance
            }
        }
        );

        map.addInteraction(homePoint);
        map.addInteraction(snap);        
    }

    //map section

    //FOR TESTING PURPOSES
    //const raster = new TileLayer({
    //    source: new XYZ({
    //        url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    //        transition: 0,
    //        //projection: 'EPSG:3857'
    //    }),
    //    zIndex: 0,
    //});

    //FOR LIVE PURPOSES
    const raster = new TileLayer({
        source: new XYZ({
            tileSize: [512, 512],
            url: 'https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=pk.eyJ1IjoiZmxvcGFzZW4iLCJhIjoiY2twYzdxOTl6MHdmdzJwcDlxNDh6YW0zcCJ9.BF89YFRpuaCEbbTkijdu0w',
            //url: 'https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/{z}/{x}/{y}@2x.jpg90?access_token=pk.eyJ1IjoiZmxvcGFzZW4iLCJhIjoiY2twYzdxOTl6MHdmdzJwcDlxNDh6YW0zcCJ9.BF89YFRpuaCEbbTkijdu0w',
            //styles/mapbox/satellite-streets-v11
            transition: 0
            }),
            //visible: false,
            zIndex: 0,
            //baseLayer: true,
            //preview: "https://ancient.land/thumbnails/satellitepic.jpg",
            //title: 'Satellite'
    });

    const osmRaster = new TileLayer({
        source: new OSM(),
        zIndex: 0,
        transition: 0
    });


    //AoI stuff
    const source = new VectorSource();
    const vector = new VectorLayer({
        source: source,
        style: new Style({
            fill: new Fill({
                color: 'rgba(0, 180, 0, 0.0)',
            }),
            stroke: new Stroke({
                color: 'rgba(255, 255, 255, 0.4)',
                width: 2,
            }),
        }),
        zIndex: 100
    });

    const extent = get('EPSG:3857').getExtent().slice();
    //increase the extent to allow for more panning on ends
    extent[0] = -20037508.34*1.05;
    extent[2] = 20037508.34*1.05;

    //extent[0] += extent[0];
    //extent[2] += extent[2];

    const modify = new Modify({
        source: source,
        insertVertexCondition: function() {
            return false;
        },
    });

    const modifyHomePoint = new Modify({
        source: drawnHomePointSource,
        insertVertexCondition: function() {
            return false;
        },
    });


    //my button
    class DrawPolygon extends Control {
        /**
       * @param {Object} [opt_options] Control options.
       */

        constructor(opt_options) {
            const options = opt_options || {};

            const button = document.createElement('button');
            button.innerHTML = '&#127919';
            button.title = 'Draw Polygon';

            const element = document.createElement('div');
            element.className = 'draw ol-selectable ol-control';
            element.appendChild(button);

            super({
                element: element,
                target: options.target,
            });

            button.addEventListener('click', () => {drawingActive = false}, false);
            button.addEventListener('click', (toggleDraw), true);

        }
    } 

    const drawPolygonButton = new DrawPolygon;

    class SatelliteImagery extends Control {
        /**
         * @param {Object} [opt_options] Control options.
        */

        constructor(opt_options) {
            const options = opt_options || {};

            const button = document.createElement('button');
            button.innerHTML = '🗺️';
            button.title = 'Satellite Imagery';

            const element = document.createElement('div');
            element.className = 'satellite ol-selectable ol-control';
            element.appendChild(button);

            super({
                element: element,
                target: options.target,
            });

            button.addEventListener('click', handleSatellite, false);
        }
    }

    const satelliteImageryButton = new SatelliteImagery;

    class DrawHomePoint extends Control {
        /**
         * @param {Object} [opt_options] Control options.
         */
         
        constructor(opt_options) {
            const options = opt_options || {};

            const button = document.createElement('button');
            button.innerHTML = '&#127968';
            button.title = 'Set Home Point';

            const element = document.createElement('div');
            element.className = 'set-home-point ol-selectable ol-control';
            element.appendChild(button);

            super({
                element: element,
                target: options.target,
            });

            button.addEventListener('click', drawHomePoint, true);
        }
    }

    const drawHomePointButton = new DrawHomePoint();

    class ExportToLitchi extends Control {
        /**
         * @param {Object} [opt_options] Control options.
         */
        
        constructor(opt_options) {
            const options = opt_options || {};

            const button = document.createElement('button');
            button.innerHTML = '&#128190';
            button.title = 'Export to Litchi';

            const element = document.createElement('div');
            element.className = 'export-to-litchi ol-selectable ol-control';
            element.appendChild(button);

            super({
                element: element,
                target: options.target,
            });

            button.addEventListener('click', saveCSV, true);
        }   
    }

    const exportToLitchiButton = new ExportToLitchi();
    
    class GeolocateButton extends Control {
        /**
         * @param {Object} [opt_options] Control options.
         */

        constructor(opt_options) {
            const options = opt_options || {};

            const button = document.createElement('button');
            button.innerHTML = '🛰️';
            button.title = 'Geolocate';

            const element = document.createElement('div');
            element.className = 'geolocate ol-selectable ol-control';
            element.appendChild(button);

            super({
                element: element,
                target: options.target
            });
            button.addEventListener('click', function () {geolocate()}, true);
        }
    }

    const geolocateButton = new GeolocateButton();

    class PhotoLayerButton extends Control {
        /**
         * @param {Object} [opt_options] Control options.
         */

        constructor(opt_options) {
            const options = opt_options || {};

            const button = document.createElement('button');
            button.innerHTML = '🌚';


            button.title = 'See Photo Footprints';

            const element = document.createElement('div');
            element.className = 'photo-layer ol-selectable ol-control';
            element.appendChild(button);

            super({
                element: element,
                target: options.target
            });

            button.addEventListener('click', function () {togglePhotoLayer()}, true);
        }
    }

    const photoLayerButton = new PhotoLayerButton();

    class DirectionButton extends Control {
        /**
         * @param {Object} [opt_options] Control options.
         */

        constructor(opt_options) {
            const options = opt_options || {};

            const button = document.createElement('button');
            button.innerHTML = '🔃';

            button.title = 'Alternate Directions';

            const element = document.createElement('div');
            element.className = 'direction ol-selectable ol-control';
            element.appendChild(button);

            super({
                element: element,
                target: options.target
            });

            button.addEventListener('click', function () {flipDirection()}, true);
        }
    }

    const directionButton = new DirectionButton();

    const map = new Map({
        layers: [osmRaster, vector],
        target: 'map',
        theme: null,
        view: new View({
            zoom: 1,
            center: [0, 0],
            extent: extent,
            maxZoom: 22,
        }),
    });

    //make an input for a search box
    let searchBox = document.createElement('input');
    searchBox.setAttribute('type', 'text');
    searchBox.setAttribute('placeholder', 'Search for a location');
    searchBox.setAttribute('id', 'searchBox');

    //make a button to search
    let searchButton = document.createElement('button');
    searchButton.setAttribute('id', 'searchButton');
    searchButton.innerHTML = '🔍';

    //append search box and button to the map
    map.getViewport().appendChild(searchBox);
    map.getViewport().appendChild(searchButton);

    //a source for the searchLayer
    let searchSource = new VectorSource();

    //a layer to pin the search location
    let searchLayer = new VectorLayer({
        source: searchSource,
        style: new Style({
            image: new CircleStyle({
                radius: 10,
                fill: new Fill({
                    color: 'rgba(255, 255, 255, 0.5)',
                }),
                stroke: new Stroke({
                    color: 'rgba(0, 0, 0, 0.5)',
                }),
            }),
        }),
        zIndex: 90,
    });


    //make a get request to the mapbox geocode api and display 5 results in a dropdown
    searchButton.addEventListener('click', function() {
        if (overlay.getVisible()) {
            overlay.toggle();
        }

        searchSource.clear();
        map.removeLayer(searchLayer);

        let searchValue = searchBox.value;
        let searchURL = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + searchValue + '.json?access_token=pk.eyJ1IjoiZmxvcGFzZW4iLCJhIjoiY2twYzdxeTVvMDFsYzJvdDZ5dG0zb3ZmbSJ9.dxikkLvuG7e-0F-wfET_Yg';
        fetch(searchURL)
            .then(response => response.json())
            .then(data => {
                let results = data.features;
                let resultsList = document.createElement('ul');
                resultsList.setAttribute('id', 'resultsList');
                map.getViewport().appendChild(resultsList);
                for (let i = 0; i < results.length; i++) {
                    let result = results[i];
                    let resultItem = document.createElement('li');
                    resultItem.setAttribute('class', 'resultItem');
                    resultItem.innerHTML = result.place_name;
                    resultsList.appendChild(resultItem);
                    //console.log(resultItem);
                    //console.log(resultsList);
                    resultItem.addEventListener('click', function() {
                        let coordinates = turf.toMercator(result.center);
                        map.getView().setCenter(coordinates);
                        map.getView().setZoom(20);
                        let searchFeature = new Feature({
                            geometry: new Point(coordinates),
                        });
                        searchSource.addFeature(searchFeature);
                        map.addLayer(searchLayer);
                        resultsList.remove();
                    });
                }
            });
    });


    //remove results list when user clicks outside of it
    document.addEventListener('click', function(e) {
        let resultsList = document.getElementById('resultsList');
        if (resultsList) {
            if (!resultsList.contains(e.target)) {
                resultsList.remove();
            }
        }
    });


    class RotateControl extends Control {
        constructor(opt_options) {
            const options = opt_options || {};
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '0';
            slider.max = '359';
            slider.value = '0';
            slider.step = '1';
            slider.className = 'slider';
            super({
                element: slider,
                target: options.target
            });
            slider.addEventListener('input', async function () {if (drawnAoI) {await lawnMowerPattern(parseInt(slider.value, 10))}}, true);
            slider.addEventListener('input', function () {currentRotation = parseInt(slider.value, 10)}, true);
            slider.addEventListener('input', function () {rotateText.innerHTML = `<span>Direction: ${slider.value}°</span>`}, true);
            //console.log(slider)
        }
    }

    const rotateControl = new RotateControl();

    class GSDControl extends Control {
        constructor(opt_options) {
            const options = opt_options || {};
            const gsd = document.createElement('input');
            gsd.type = 'range';
            gsd.min = '100';
            gsd.max = '15000';
            gsd.value = '3000';
            gsd.step = '100';
            gsd.className = 'gsdslider';
            super({
                element: gsd,
                target: options.target
            });
            gsd.addEventListener('input', function () {currentGsd = parseInt(gsd.value)}, true);
            gsd.addEventListener('input', function () {heightOffset = getHeight(currentGsd, camera.sensorWidth, camera.focalLength, camera.imageWidth)}, true);
            gsd.addEventListener('input', async function () {if (drawnAoI) {sidelapDistance = lineWidthSeparation(currentGsd, imageWidth, currentSidelap)}}, true);
            gsd.addEventListener('input', function () {frontlapSpacing = turf.convertLength(lineWidthSeparation(currentGsd, imageHeight, currentFrontlap), 'degrees', 'meters')}, true);
            gsd.addEventListener('input', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
            gsd.addEventListener('input', function () {gsdText.innerHTML = `<span>GSD: ${currentGsd/1000} : ${heightOffset.toPrecision(3)}m : ${(heightOffset*3.28084).toPrecision(3)}ft</span>`}, true);
            //gsd.addEventListener('change', function () {makeMenu()}, true);
        }
    }

    const gsdControl = new GSDControl();

    class NudgeControl extends Control {
        constructor(opt_options) {
            const options = opt_options || {};
            const nudge = document.createElement('input');
            nudge.type = 'range';
            nudge.min = '0';
            nudge.max = '200';
            nudge.value = '0';
            nudge.step = '1';
            nudge.className = 'nudgeslider';
            super({
                element: nudge,
                target: options.target
            });
            nudge.addEventListener('input', function () {currentNudge = parseInt(nudge.value)}, true);
            nudge.addEventListener('input', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
            nudge.addEventListener('input', function () {nudgeText.innerHTML = `<span>Nudged: ${nudge.value}</span>`}, true);
            
        }
    }
    const nudgeControl = new NudgeControl();


    class SidelapControl extends Control {
        constructor(opt_options) {
            const options = opt_options || {};
            const sidelap = document.createElement('input');
            sidelap.type = 'range';
            sidelap.min = '100';
            sidelap.max = '950';
            sidelap.value = '700';
            sidelap.step = '10';
            sidelap.className = 'sidelapslider';
            super({
                element: sidelap,
                target: options.target
            });
            sidelap.addEventListener('input', function () {currentSidelap = parseInt(sidelap.value)}, true);
            sidelap.addEventListener('input', async function () {if (drawnAoI) {sidelapDistance = lineWidthSeparation(currentGsd, imageWidth, currentSidelap)}}, true);
            sidelap.addEventListener('input', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
            sidelap.addEventListener('input', function () {sidelapText.innerHTML = `<span>Sidelap: ${sidelap.value/10}%</span>`}, true);
        }
    }

    const sidelapControl = new SidelapControl();


    class FrontlapControl extends Control {
        constructor(opt_options) {
            const options = opt_options || {};
            const frontlap = document.createElement('input');
            frontlap.type = 'range';
            frontlap.min = '100';
            frontlap.max = '950';
            frontlap.value = '400';
            frontlap.step = '10';
            frontlap.className = 'frontlapslider';
            super({
                element: frontlap,
                target: options.target
            });
            frontlap.addEventListener('input', function () {currentFrontlap = parseInt(frontlap.value)}, true);
            frontlap.addEventListener('input', async function () {if (drawnAoI) {frontlapSpacing = lineWidthSeparation(currentGsd, imageHeight, currentFrontlap)}}, true);
            frontlap.addEventListener('input', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
            frontlap.addEventListener('input', function () {frontlapText.innerHTML = `<span>Frontlap: ${frontlap.value/10}%</span>`}, true);
            frontlap.addEventListener('input', function () {frontlapSpacing = turf.convertLength(lineWidthSeparation(currentGsd, imageHeight, currentFrontlap), 'degrees', 'meters')}, true);
            //frontlap.addEventListener('input', function () {frontlapDisplay.innerHTML = `<span>Frontlap: ${frontlapSpacing.toPrecision(3)}m : ${(frontlapSpacing*3.28084).toPrecision(3)}ft</span>`}, true);
        }
    }
    const frontlapControl = new FrontlapControl();

    class SpeedControl extends Control {
        constructor(opt_options) {
            const options = opt_options || {};
            const speed = document.createElement('input');
            speed.type = 'range';
            speed.min = '1';
            speed.max = '150';
            speed.value = '30';
            speed.step = '1';
            speed.className = 'speedslider';
            super({
                element: speed,
                target: options.target
            });
            speed.addEventListener('input', function () {currentSpeed = parseInt(speed.value)}, true);
            speed.addEventListener('input', function () {speedText.innerHTML = `<span>Speed:${currentSpeed/10}m (${(currentSpeed/10*3.28084).toPrecision(3)}ft)/s</span>`}, true);
            speed.addEventListener('input', function () {minTime.innerHTML = `🕓 > ${Math.ceil((((traverseDistance+firstAndLastLineDistance)/(currentSpeed/10))/60)*1.5)+2}min`;}, true); //1.5 multiplier to account for travel variance, +2 for takeoff and landing
        }
    }

    const speedControl = new SpeedControl();

    class HeightUpdate extends Control {
        constructor(opt_options) {
            const options = opt_options || {};
            const heightUpdater = document.createElement('input');
            heightUpdater.type = 'range';
            heightUpdater.min = '1';
            heightUpdater.max = '50';
            heightUpdater.value = '1';
            heightUpdater.step = '1';
            heightUpdater.className = 'densifyslider';
            super({
                element: heightUpdater,
                target: options.target
            });
            heightUpdater.addEventListener('input', function () {waypointFrequency = parseInt(heightUpdater.value)}, true);
            heightUpdater.addEventListener('input', function () {heightUpdateText.innerHTML = `<span>Z Check: ${waypointFrequency}</span>`}, true);
            heightUpdater.addEventListener('input', function () {if (drawnAoI){lawnMowerPattern(currentRotation, camera)}}, true);
        }
    }

    const heightUpdateControl = new HeightUpdate();

    class GimbalControl extends Control {
        constructor(opt_options) {
            const options = opt_options || {};
            const gimbal = document.createElement('input');
            gimbal.type = 'range';
            gimbal.min = '-90';
            gimbal.max = '0';
            gimbal.value = '-90';
            gimbal.step = '1';
            gimbal.className = 'gimbalslider';
            super({
                element: gimbal,
                target: options.target
            });
            gimbal.addEventListener('input', function () {currentGimbal = parseInt(gimbal.value)}, true);
            gimbal.addEventListener('input', function () {gimbalText.innerHTML = `<span>Gimbal: ${currentGimbal}°</span>`}, true);
            gimbal.addEventListener('input', function () {if (drawnAoI){lawnMowerPattern(currentRotation, camera)}}, true);
        }
    }

    const gimbalControl = new GimbalControl();


    let menuStuff;
    let rotateText;
    let gsdText;
    let nudgeText;
    let sidelapText;
    let frontlapText;
    let frontlapDisplay;
    let speedText;
    let imageWidthText;
    let imageHeightText;
    let sensorWidthText;
    let focalLengthText;
    let heightUpdateText;
    let gimbalText;

    let totalDistance = document.createElement('div');
    totalDistance.className = 'totalDistance';
    if (traverseDistance!=0) {
    totalDistance.innerHTML = `📐: ${((traverseDistance+firstAndLastLineDistance)/1000).toPrecision(3)}km | ${(((traverseDistance+firstAndLastLineDistance)*3.28084)*0.000189394).toPrecision(3)}mi`;
    } else {
    totalDistance.innerHTML = `📐:`;
    }
    map.getViewport().appendChild(totalDistance);

    let minTime = document.createElement('div');
    minTime.className = 'minTime';
    if (traverseDistance!=0) {
    minTime.innerHTML = `🕓 > ${Math.ceil((((traverseDistance+firstAndLastLineDistance)/(currentSpeed/10))/60)*1.5)+2}min`; //add 2 minutes for takeoff and landing and 1.5 multiplier to account for travel variance
    } else {
    minTime.innerHTML = `🕓:`;
    }
    map.getViewport().appendChild(minTime);

    let photoTally = document.createElement('div');
    photoTally.className = 'photoTally';
    if (traverseDistance!=0) {
    photoTally.innerHTML = `📷: ~${photoCount}, interval: ${frontlapSpacing.toFixed(2)}m`;
    } else {
    photoTally.innerHTML = `📷:`;
    }
    map.getViewport().appendChild(photoTally);

    let aoiArea = document.createElement('div');
    aoiArea.className = 'aoiArea';
    if (traverseDistance!=0) {
        aoiArea.innerHTML = `🔳: ${areaAcres.toFixed(2)}ac | ${areaHectares.toFixed(2)}ha`;
    } else {
        aoiArea.innerHTML = `🔳:`;
    }
    map.getViewport().appendChild(aoiArea);


    function updateFrontlapDistance() {
        frontlapMetres = (currentGsd/1000 * imageHeight)/100; //base value of how much of the earth is captured in the photo
        frontlapSpacing = frontlapMetres*(1-currentFrontlap/1000); //how much of the earth is captured in the photo * frontlap percentage
        frontlapDisplay.innerHTML = `${frontlapSpacing.toFixed(3)} + "m"`;
    }

    function makeMenu() {

        let timeout;

        let counterClockwiseButton = document.createElement('button');
        counterClockwiseButton.innerHTML = '-';
        counterClockwiseButton.title = 'Rotate Counter Clockwise';
        counterClockwiseButton.addEventListener('click', function () {if (currentRotation == 0) {currentRotation == 0} else{currentRotation--}}, true);
        counterClockwiseButton.addEventListener('click', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
        counterClockwiseButton.addEventListener('click', function () {rotateControl.element.value = currentRotation}, true);
        counterClockwiseButton.addEventListener('click', function () {rotateText.innerHTML = `<span>Direction: ${currentRotation}°</span>`}, true);

        let clockwiseButton = document.createElement('button');
        clockwiseButton.innerHTML = '+';
        clockwiseButton.title = 'Rotate Clockwise';
        clockwiseButton.addEventListener('click', function () {if (currentRotation >= 359){currentRotation = 359} else currentRotation++}, true);
        clockwiseButton.addEventListener('click', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
        clockwiseButton.addEventListener('click', function () {rotateControl.element.value = currentRotation}, true);
        clockwiseButton.addEventListener('click', function () {rotateText.innerHTML = `<span>Direction: ${currentRotation}°</span>`}, true);

        let speedUpButton = document.createElement('button');
        speedUpButton.innerHTML = '+';
        speedUpButton.title = 'Speed Up';
        speedUpButton.addEventListener('click', function () {if (currentSpeed >= 150){currentSpeed = 150} else currentSpeed += 1}, true);
        speedUpButton.addEventListener('click', function () {speedControl.element.value = currentSpeed}, true);
        speedUpButton.addEventListener('click', function () {speedText.innerHTML = `<span>Speed:${currentSpeed/10}m (${(currentSpeed/10*3.28084).toPrecision(3)}ft)/s</span>`}, true);
        speedUpButton.addEventListener('click', function () {minTime.innerHTML = `🕓 > ${Math.ceil((((traverseDistance+firstAndLastLineDistance)/(currentSpeed/10))/60)*1.5)+2}min`;}, true); //add 2 minutes for takeoff and landing and 1.5 multiplier to account for travel variance

        let speedDownButton = document.createElement('button');
        speedDownButton.innerHTML = '-';
        speedDownButton.title = 'Slow Down';
        speedDownButton.addEventListener('click', function () {if (currentSpeed == 1){currentSpeed = 1} else currentSpeed -= 1}, true);
        speedDownButton.addEventListener('click', function () {speedControl.element.value = currentSpeed}, true);
        speedDownButton.addEventListener('click', function () {speedText.innerHTML = `<span>Speed:${currentSpeed/10}m (${(currentSpeed/10*3.28084).toPrecision(3)}ft)/s</span>`}, true);
        speedDownButton.addEventListener('click', function () {minTime.innerHTML = `🕓 > ${Math.ceil((((traverseDistance+firstAndLastLineDistance)/(currentSpeed/10))/60)*1.5)+2}min`;}, true); //add 2 minutes for takeoff and landing and 1.5 multiplier to account for travel variance
        
        let gsdUpButton = document.createElement('button');
        gsdUpButton.innerHTML = '+';
        gsdUpButton.title = 'Increase GSD';
        gsdUpButton.addEventListener('click', function () {if (currentGsd >= 15000){currentGsd = 15000} else currentGsd += 100}, true);
        gsdUpButton.addEventListener('click', function() {heightOffset = getHeight(currentGsd, camera.sensorWidth, camera.focalLength, camera.imageWidth)}, true);
        gsdUpButton.addEventListener('click', async function () {if (drawnAoI) {sidelapDistance = lineWidthSeparation(currentGsd, imageWidth, currentSidelap)}}, true);
        gsdUpButton.addEventListener('click', function () {frontlapSpacing = turf.convertLength(lineWidthSeparation(currentGsd, imageHeight, currentFrontlap), 'degrees', 'meters')}, true);
        gsdUpButton.addEventListener('click', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
        gsdUpButton.addEventListener('click', function () {gsdControl.element.value = currentGsd}, true);
        gsdUpButton.addEventListener('click', function () {gsdText.innerHTML = `<span>GSD: ${currentGsd/1000} : ${heightOffset.toPrecision(3)}m : ${(heightOffset*3.28084).toPrecision(3)}ft</span>`}, true);
        gsdUpButton.addEventListener('click', function () {frontlapDisplay.innerHTML = `<span>${frontlapSpacing.toPrecision(3)}m</span>`;}, true);

        let gsdDownButton = document.createElement('button');
        gsdDownButton.innerHTML = '-';
        gsdDownButton.title = 'Decrease GSD';
        gsdDownButton.addEventListener('click', function () {if (currentGsd <= 100){currentGsd = 100} else currentGsd -= 100}, true);
        gsdDownButton.addEventListener('click', function() {heightOffset = getHeight(currentGsd, camera.sensorWidth, camera.focalLength, camera.imageWidth)}, true);
        gsdDownButton.addEventListener('click', async function () {if (drawnAoI) {sidelapDistance = lineWidthSeparation(currentGsd, imageWidth, currentSidelap)}}, true);
        gsdDownButton.addEventListener('click', function () {frontlapSpacing = turf.convertLength(lineWidthSeparation(currentGsd, imageHeight, currentFrontlap), 'degrees', 'meters')}, true);
        gsdDownButton.addEventListener('click', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
        gsdDownButton.addEventListener('click', function () {gsdControl.element.value = currentGsd}, true);
        gsdDownButton.addEventListener('click', function () {gsdText.innerHTML = `<span>GSD: ${currentGsd/1000} : ${heightOffset.toPrecision(3)}m : ${(heightOffset*3.28084).toPrecision(3)}ft</span>`}, true);
        gsdDownButton.addEventListener('click', function () {frontlapDisplay.innerHTML = `<span>${frontlapSpacing.toPrecision(3)}m</span>`;}, true);

        let nudgeUpButton = document.createElement('button');
        nudgeUpButton.innerHTML = '+';
        nudgeUpButton.title = 'Increase Nudge';
        nudgeUpButton.addEventListener('click', function () {if (currentNudge >= 200){currentNudge = 200} else currentNudge++}, true);
        nudgeUpButton.addEventListener('click', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
        nudgeUpButton.addEventListener('click', function () {nudgeControl.element.value = currentNudge}, true);
        nudgeUpButton.addEventListener('click', function () {nudgeText.innerHTML = `<span>Nudged: ${(currentNudge)}</span>`}, true);$

        let nudgeDownButton = document.createElement('button');
        nudgeDownButton.innerHTML = '-';
        nudgeDownButton.title = 'Decrease Nudge';
        nudgeDownButton.addEventListener('click', function () {if (currentNudge <= 0){currentNudge = 0} else currentNudge--}, true);
        nudgeDownButton.addEventListener('click', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
        nudgeDownButton.addEventListener('click', function () {nudgeControl.element.value = currentNudge}, true);
        nudgeDownButton.addEventListener('click', function () {nudgeText.innerHTML = `<span>Nudged: ${(currentNudge)}</span>`}, true);

        let sidelapUpButton = document.createElement('button');
        sidelapUpButton.innerHTML = '+';
        sidelapUpButton.title = 'Increase Overlap';
        sidelapUpButton.addEventListener('click', function () {if (currentSidelap >= 950){currentSidelap = 950} else currentSidelap += 10}, true);
        sidelapUpButton.addEventListener('click', async function () {if (drawnAoI) {sidelapDistance = lineWidthSeparation(currentGsd, imageWidth, currentSidelap)}}, true);
        sidelapUpButton.addEventListener('click', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
        sidelapUpButton.addEventListener('click', function () {sidelapControl.element.value = currentSidelap}, true);
        sidelapUpButton.addEventListener('click', function () {sidelapText.innerHTML = `<span>Sidelap: ${currentSidelap/10}%</span>`}, true);

        let sidelapDownButton = document.createElement('button');
        sidelapDownButton.innerHTML = '-';
        sidelapDownButton.title = 'Decrease Overlap';
        sidelapDownButton.addEventListener('click', function () {if (currentSidelap <= 100){currentSidelap = 100} else currentSidelap -= 10}, true);
        sidelapDownButton.addEventListener('click', async function () {if (drawnAoI) {sidelapDistance = lineWidthSeparation(currentGsd, imageWidth, currentSidelap)}}, true);
        sidelapDownButton.addEventListener('click', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
        sidelapDownButton.addEventListener('click', function () {sidelapControl.element.value = currentSidelap}, true);
        sidelapDownButton.addEventListener('click', function () {sidelapText.innerHTML = `<span>Sidelap: ${currentSidelap/10}%</span>`}, true);
        
        let frontlapUpButton = document.createElement('button');
        frontlapUpButton.innerHTML = '+';
        frontlapUpButton.title = 'Increase Frontlap';
        frontlapUpButton.addEventListener('click', function () {if (currentFrontlap >= 950){currentFrontlap = 950} else currentFrontlap += 10}, true);
        frontlapUpButton.addEventListener('click', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
        frontlapUpButton.addEventListener('click', function () {frontlapSpacing = turf.convertLength(lineWidthSeparation(currentGsd, imageHeight, currentFrontlap), 'degrees', 'meters')}, true);
        frontlapUpButton.addEventListener('click', function () {frontlapControl.element.value = currentFrontlap}, true);
        frontlapUpButton.addEventListener('click', function () {frontlapText.innerHTML = `<span>Frontlap: ${currentFrontlap/10}%</span>`}, true);
        frontlapUpButton.addEventListener('click', function () {frontlapDisplay.innerHTML = `<span>${frontlapSpacing.toPrecision(3)}m</span>`;}, true);

        let frontlapDownButton = document.createElement('button');
        frontlapDownButton.innerHTML = '-';
        frontlapDownButton.title = 'Decrease Frontlap';
        frontlapDownButton.addEventListener('click', function () {if (currentFrontlap <= 100){currentFrontlap = 100} else currentFrontlap -= 10}, true);
        frontlapDownButton.addEventListener('click', async function () {if (drawnAoI) {await lawnMowerPattern(currentRotation, camera)}}, true);
        frontlapDownButton.addEventListener('click', function () {frontlapSpacing = turf.convertLength(lineWidthSeparation(currentGsd, imageHeight, currentFrontlap), 'degrees', 'meters')}, true);
        frontlapDownButton.addEventListener('click', function () {frontlapControl.element.value = currentFrontlap}, true);
        frontlapDownButton.addEventListener('click', function () {frontlapText.innerHTML = `<span>Frontlap: ${currentFrontlap/10}%</span>`}, true);
        frontlapDownButton.addEventListener('click', function () {frontlapDisplay.innerHTML = `<span>${frontlapSpacing.toPrecision(3)}m</span>`;}, true);

        let heightUpdateUpButton = document.createElement('button');
        heightUpdateUpButton.innerHTML = '+';
        heightUpdateUpButton.title = 'Adjust Less Often';
        heightUpdateUpButton.addEventListener('click', function () {if (waypointFrequency >= 50){waypointFrequency = 50} else waypointFrequency += 1}, true);
        heightUpdateUpButton.addEventListener('click', function () {heightUpdateControl.element.value = waypointFrequency}, true);
        heightUpdateUpButton.addEventListener('click', function () {heightUpdateText.innerHTML = `<span>Z Check: ${waypointFrequency}</span>`}, true);
        heightUpdateUpButton.addEventListener('click', function () {if (drawnAoI) {lawnMowerPattern(currentRotation, camera)}}, true);

        let heightUpdateDownButton = document.createElement('button');
        heightUpdateDownButton.innerHTML = '-';
        heightUpdateDownButton.title = 'Adjust More Often';
        heightUpdateDownButton.addEventListener('click', function () {if (waypointFrequency <= 1){waypointFrequency = 1} else waypointFrequency -= 1}, true);
        heightUpdateDownButton.addEventListener('click', function () {heightUpdateControl.element.value = waypointFrequency}, true);
        heightUpdateDownButton.addEventListener('click', function () {heightUpdateText.innerHTML = `<span>Z Check: ${waypointFrequency}</span>`}, true);
        heightUpdateDownButton.addEventListener('click', function () {if (drawnAoI) {lawnMowerPattern(currentRotation, camera)}}, true);

        let gimbalControlUpButton = document.createElement('button');
        gimbalControlUpButton.innerHTML = '+';
        gimbalControlUpButton.title = 'Increase Gimbal Angle';
        gimbalControlUpButton.addEventListener('click', function () {if (currentGimbal >= 0){currentGimbal = 0} else currentGimbal += 1}, true);
        gimbalControlUpButton.addEventListener('click', function () {gimbalControl.element.value = currentGimbal}, true);
        gimbalControlUpButton.addEventListener('click', function () {gimbalText.innerHTML = `<span>Gimbal: ${currentGimbal}°</span>`}, true);
        gimbalControlUpButton.addEventListener('click', function () {if (drawnAoI) {lawnMowerPattern(currentRotation, camera)}}, true);

        let gimbalControlDownButton = document.createElement('button');
        gimbalControlDownButton.innerHTML = '-';
        gimbalControlDownButton.title = 'Decrease Gimbal Angle';
        gimbalControlDownButton.addEventListener('click', function () {if (currentGimbal <= -90){currentGimbal = -90} else currentGimbal -= 1}, true);
        gimbalControlDownButton.addEventListener('click', function () {gimbalControl.element.value = currentGimbal}, true);
        gimbalControlDownButton.addEventListener('click', function () {gimbalText.innerHTML = `<span>Gimbal: ${currentGimbal}°</span>`}, true);
        gimbalControlDownButton.addEventListener('click', function () {if (drawnAoI) {lawnMowerPattern(currentRotation, camera)}}, true);        

        let imageWidthDisplay = document.createElement('div');
        imageWidthDisplay.innerHTML = `<span>${imageWidth}px</span>`;
        imageWidthDisplay.className = 'imageWidthDisplay';

        let imageHeightDisplay = document.createElement('div');
        imageHeightDisplay.innerHTML = `<span>${imageHeight}px</span>`;
        imageHeightDisplay.className = 'imageHeightDisplay';
        
        let sensorWidthDisplay = document.createElement('div');
        sensorWidthDisplay.innerHTML = `<span>${sensorWidth}mm</span>`;
        sensorWidthDisplay.className = 'sensorWidthDisplay';

        let focalLengthDisplay = document.createElement('div');
        focalLengthDisplay.innerHTML = `<span>${focalLength}mm</span>`;
        focalLengthDisplay.className = 'focalLengthDisplay';

        let frontlapDisplay = document.createElement('div');
        frontlapDisplay.innerHTML = `<span>${frontlapSpacing.toPrecision(3)}m</span>`;
        frontlapDisplay.className = 'frontlapDisplay';

        overlay.setContent(null);
        menuStuff = document.createElement('menuStuff');
        menuStuff.className = 'menuStuff';

        //make a select element that changes the camera
        let cameraSelect = document.createElement('select');
        cameraSelect.title = 'Select Camera';
        cameraSelect.addEventListener('change', function () {
            let selectedCamera = cameraSelect.options[cameraSelect.selectedIndex];
            imageHeight = selectedCamera.imageHeight;
            imageWidth = selectedCamera.imageWidth;
            sensorWidth = selectedCamera.sensorWidth;
            currentCamera = selectedCamera.value;
            //sensorHeight = selectedCamera.sensorHeight;
            focalLength = selectedCamera.focalLength;        
            heightOffset = getHeight(currentGsd, sensorWidth, focalLength, imageWidth);

            //let selectedCamera = cameraSelect.options[cameraSelect.selectedIndex];
            //console.log(selectedCamera, 'selectedCamera');

            camera = new Camera(sensorWidth, focalLength, imageWidth, imageHeight);
            //imageHeight = selectedCamera.imageHeight;
            //imageWidth = selectedCamera.imageWidth;
            //sensorWidth = selectedCamera.sensorWidth;
            //sensorHeight = selectedCamera.sensorHeight;
            //focalLength = selectedCamera.focalLength;
            heightOffset = getHeight(currentGsd, sensorWidth, focalLength, imageWidth);

            gsdText.innerHTML = `<span>GSD: ${currentGsd/1000} : ${heightOffset.toPrecision(3)}m : ${(heightOffset*3.28084).toPrecision(3)}ft</span>`;
            imageHeightDisplay.innerHTML = `<span>${imageHeight}px</span>`;
            imageWidthDisplay.innerHTML = `<span>${imageWidth}px</span>`;
            sensorWidthDisplay.innerHTML = `<span>${sensorWidth}mm</span>`;
            focalLengthDisplay.innerHTML = `<span>${focalLength}mm</span>`;
            //imageWidthInput.value = imageWidth;
            //imageHeightInput.value = imageHeight;
            //sensorWidthInput.value = sensorWidth;
            //focalLengthInput.value = focalLength;
            //console.log(currentCamera.indexOf('Phantom'));
            sidelapDistance = lineWidthSeparation(currentGsd, imageWidth, currentSidelap);
            if(drawnAoI){
            lawnMowerPattern(currentRotation, camera);
            };
        }, true);

        rotateText = document.createElement('p');
        rotateText.innerHTML = `<span>Direction: ${currentRotation}°</span>`;
        rotateText.className = 'rotateText';

        speedText = document.createElement('p');
        speedText.innerHTML = `<span>Speed:${currentSpeed/10}m (${(currentSpeed/10*3.28084).toPrecision(3)}ft)/s</span>`;
        speedText.className = 'speedText';

        gsdText = document.createElement('p');
        gsdText.innerHTML = `<span>GSD: ${currentGsd/1000} : ${heightOffset.toPrecision(3)}m : ${(heightOffset*3.28084).toPrecision(3)}ft</span>`;
        gsdText.className = 'gsdText';

        nudgeText = document.createElement('p');
        nudgeText.innerHTML = `<span>Nudged: ${currentNudge}</span>`;
        nudgeText.className = 'nudgeText';
        
        sidelapText = document.createElement('p');
        sidelapText.innerHTML = `<span>Sidelap: ${currentSidelap/10}%</span>`;
        sidelapText.className = 'sidelapText';

        frontlapText = document.createElement('p');
        frontlapText.innerHTML = `<span>Frontlap: ${currentFrontlap/10}%</span>`;
        frontlapText.className = 'frontlapText';

        imageWidthText = document.createElement('p');
        imageWidthText.innerHTML = `<span>Photo Width</span>`;
        imageWidthText.className = 'imageWidthText';

        imageHeightText = document.createElement('p');
        imageHeightText.innerHTML = `<span>Photo Height</span>`;
        imageHeightText.className = 'imageHeightText';

        sensorWidthText = document.createElement('p');
        sensorWidthText.innerHTML = `<span>Sensor Width</span>`;
        sensorWidthText.className = 'sensorWidthText';

        focalLengthText = document.createElement('p');
        focalLengthText.innerHTML = `<span>Focal Length</span>`;
        focalLengthText.className = 'focalLengthText';

        heightUpdateText = document.createElement('p');
        heightUpdateText.innerHTML = `<span>Z Check: ${waypointFrequency}</span>`;
        heightUpdateText.className = 'heightUpdateText';

        gimbalText = document.createElement('p');
        gimbalText.innerHTML = `Gimbal: ${currentGimbal}°`;
        gimbalText.className = 'gimbalText';

        //make a set of cameras to choose from
        let cameraOptions = [
            {name: 'DJI Mini 2', sensorWidth: 6.3, focalLength: 4.49, imageWidth: 4000, imageHeight: 3000}, //checked DNG
            {name: 'DJI Mavic Mini', sensorWidth: 6.3, focalLength: 4.49, imageWidth: 4000, imageHeight: 3000}, //checked DNG
            {name: 'DJI Mini SE', sensorWidth: 6.3, focalLength: 4.49, imageWidth: 4000, imageHeight: 3000}, //checked DNG
            {name: 'DJI Air 2S', sensorWidth: 13.2, focalLength: 8.4, imageWidth: 5472, imageHeight: 3648}, //checked DNG
            {name: 'DJI Mavic Air', sensorWidth: 13.2, focalLength: 4.7, imageWidth: 4056, imageHeight: 3040}, //checked DNG
            {name: 'DJI Mavic Air 2', sensorWidth: 6.3, focalLength: 4.49, imageWidth: 8000, imageHeight: 6000}, //checked DNG
            {name: 'DJI Mavic 2 Pro', sensorWidth: 13.2, focalLength: 10.3, imageWidth: 5472, imageHeight: 3648}, //checked DNG
            {name: 'DJI Mavic 2 Zoom', sensorWidth: 6.3, focalLength: 8.6, imageWidth: 4000, imageHeight: 3000}, //checked DNG
            {name: 'DJI Phantom 3', sensorWidth: 6.3, focalLength: 3.61, imageWidth: 4000, imageHeight: 3000}, //all models similar photo specs
            {name: 'DJI Phantom 4', sensorWidth: 6.3, focalLength: 3.61, imageWidth: 4000, imageHeight: 3000}, //confirmed multiple places
            {name: 'DJI Phantom 4 Pro / 2.0 / Advanced', sensorWidth: 13.2, focalLength: 8.8, imageWidth: 5472, imageHeight: 3648}, //checked DNG, all drones same camera
        ];

        //add the camera options to the select element
        for (let i = 0; i < cameraOptions.length; i++) {
            let option = document.createElement('option');
            option.value = cameraOptions[i].name;
            option.text = cameraOptions[i].name;
            option.sensorWidth = cameraOptions[i].sensorWidth;
            option.focalLength = cameraOptions[i].focalLength;
            option.imageWidth = cameraOptions[i].imageWidth;
            option.imageHeight = cameraOptions[i].imageHeight;
            cameraSelect.appendChild(option);
        }

        menuStuff.appendChild(cameraSelect);

        menuStuff.appendChild(rotateText);
        menuStuff.appendChild(rotateControl.element);
        menuStuff.appendChild(counterClockwiseButton);
        menuStuff.appendChild(clockwiseButton);

        menuStuff.appendChild(speedText);
        menuStuff.appendChild(speedControl.element);
        menuStuff.appendChild(speedDownButton);
        menuStuff.appendChild(speedUpButton);

        menuStuff.appendChild(gsdText);
        menuStuff.appendChild(gsdControl.element);
        menuStuff.appendChild(gsdDownButton);
        menuStuff.appendChild(gsdUpButton);

        menuStuff.appendChild(nudgeText);
        menuStuff.appendChild(nudgeControl.element);
        menuStuff.appendChild(nudgeDownButton);
        menuStuff.appendChild(nudgeUpButton);

        menuStuff.appendChild(sidelapText);
        menuStuff.appendChild(sidelapControl.element);
        menuStuff.appendChild(sidelapDownButton);
        menuStuff.appendChild(sidelapUpButton);

        menuStuff.appendChild(frontlapText);
        menuStuff.appendChild(frontlapControl.element);
        menuStuff.appendChild(frontlapDownButton);
        menuStuff.appendChild(frontlapUpButton);

        menuStuff.appendChild(heightUpdateText);
        menuStuff.appendChild(heightUpdateControl.element);
        menuStuff.appendChild(heightUpdateDownButton);
        menuStuff.appendChild(heightUpdateUpButton);

        menuStuff.appendChild(gimbalText);
        menuStuff.appendChild(gimbalControl.element);
        menuStuff.appendChild(gimbalControlDownButton);
        menuStuff.appendChild(gimbalControlUpButton);


        //menuStuff.appendChild(imageWidthText);
        //menuStuff.appendChild(imageWidthDisplay);
        ////menuStuff.appendChild(imageWidthInput);
//
        //menuStuff.appendChild(imageHeightText);
        //menuStuff.appendChild(imageHeightDisplay);
        ////menuStuff.appendChild(imageHeightInput);
//
        //menuStuff.appendChild(sensorWidthText);
        //menuStuff.appendChild(sensorWidthDisplay);
        ////menuStuff.appendChild(sensorWidthInput);
//
        //menuStuff.appendChild(focalLengthText);
        //menuStuff.appendChild(focalLengthDisplay);
        //menuStuff.appendChild(focalLengthInput);

        //menuStuff.appendChild(frontlapDistanceText);
        //menuStuff.appendChild(frontlapDisplay);
        
        overlay.setContent(menuStuff);
    }
    

    const overlay = new Overlay({ 
        closeBox: true,
    	className: "slide-left menu", 
    	content: null,
    });
    overlay.toggle();
    map.addControl(overlay);

    // A toggle control to show/hide the menu
    const t = new Toggle(
        {	html: '&#9776',
            className: "menu",
            title: "Menu",
            onToggle: function() { overlay.toggle(); makeMenu(); }
        });
    map.addControl(t);

    // A toggle control to show/hide the tools
    const t2 = new Toggle(
        {	html: '🛠️',
            className: "tools",
            title: "Tools",
            onToggle: function() { toggleTools(); }
        });
    map.addControl(t2);

    let toolsVisible = false;

    function toggleTools() {
        if (toolsVisible) {
            //console.log('tools invisible');
            //console.log(map.getControls());
            map.removeControl(drawPolygonButton);
            map.removeControl(drawHomePointButton);
            map.removeControl(exportToLitchiButton);
            map.removeControl(geolocateButton);
            map.removeControl(photoLayerButton);
            map.removeControl(satelliteImageryButton);
            map.removeControl(directionButton);
            toolsVisible = false;
        } else if (!toolsVisible) {{   
            //console.log('tools visible'); 
            map.controls.extend([drawPolygonButton]);
            map.controls.extend([drawHomePointButton]);
            map.controls.extend([exportToLitchiButton]);
            map.controls.extend([geolocateButton]);
            map.controls.extend([photoLayerButton]);
            map.controls.extend([satelliteImageryButton]);
            map.controls.extend([directionButton]);
            toolsVisible = true;
            //console.log(map.getControls());
            }
        } else {
            //console.log('something went wrong');
        }
    }


    map.addInteraction(modify);
    map.addInteraction(modifyHomePoint);

    async function lawnMowerPattern(rotation, camera) {

        traverseDistance = 0;

        //get bbox of polygon
        let bboxtest = turf.bbox(drawnAoI);

        //TURF ROTATION
        let rotatedDrawnAoI = turf.transformRotate(drawnAoI, 0, {mutate: true});

        let bboxDouble = doubleBbox(bboxtest);
        let bboxDoubleHeight = bboxDouble[3] - bboxDouble[1];
        let bboxDoubleWidth = bboxDouble[2] - bboxDouble[0];

        map.removeLayer(rectangleGridLayer);
        rectangleGridLayer.setSource(null);
        rectangleGridSource.clear();
        let newRectangleGrid;
        let newRectangleGridRotating;

        map.removeLayer(gridPointsLayer);
        gridPointsLayer.setSource(null);
        gridPointsSource.clear();
        let newGridPoints;
        gridPointsCollection = turf.featureCollection([]);

        map.removeLayer(photosLayer);
        photosLayer.setSource(null);
        photosSource.clear();
        let newPhotoCollection = turf.featureCollection([]);

        map.removeLayer(gridLinesLayer);
        gridLinesLayer.setSource(null);
        gridLinesSource.clear();
        let newGridLines;
        let newGridLineCollection = turf.featureCollection([]);

        map.removeLayer(firstAndLastLinesLayer);
        firstAndLastLinesLayer.setSource(null);
        firstAndLastLinesSource.clear();
        let newFirstAndLastLines;
        let newFirstAndLastLineCollection = turf.featureCollection([]);

        let newBbox = turf.bbox(drawnAoI);

        //increase size to accomodate for rotation
        let newBboxDouble = doubleBbox(newBbox);
        let newBboxDoubleHeight = newBboxDouble[3] - newBboxDouble[1];
        let newBboxDoubleWidth = newBboxDouble[2] - newBboxDouble[0];

        newRectangleGrid = rectangleGrid(newBboxDouble, sidelapDistance, newBboxDoubleHeight*0.99, {units: 'degrees'}); //feature collection

        //rotate by the slider value
        if (newRectangleGrid.features.length > 0) {
        newRectangleGridRotating = turf.transformTranslate(turf.transformRotate(newRectangleGrid, rotation, {mutate: true}), currentNudge, 45, {units: 'metres'}); // GeoJSON
        }

        //delete every other feature to avoid duplicate vertices
        for (let i = 0; i < newRectangleGridRotating.features.length; i++) {
            if (i % 1 === 0) {
                newRectangleGridRotating.features.splice(i, 1);
            }
        }

        //makes a point for every intersection but results are out of order if current destination line ends prematurely
        if (newRectangleGridRotating.features.length > 0) {
        newGridPoints = turf.lineIntersect(newRectangleGridRotating, drawnAoI);
        }

        //determine orientation of grid
        function getOrientation(polygon) {
            if (polygon.features.length > 0) {
            let firstPoint = polygon.features[0].geometry.coordinates;
            //console.log(firstPoint, 'firstPoint');
            let secondPoint = polygon.features[1].geometry.coordinates;
            //console.log(secondPoint, 'secondPoint');
            let north = firstPoint[1] < secondPoint[1];
            let east = firstPoint[0] < secondPoint[0];

            //console.log(firstPoint, secondPoint, 'points');           
            
            if (north && east) {
                return 'northeast';
            } else if (!north && east) {
                return 'southeast';
            } else if (north && !east) {
                return 'northwest';
            } else if (!north && !east) {
                return 'southwest';
            } else {console.log('error in detecting direction');}
            } else {console.log('error in detecting direction (no polygon)');}
        }
        const direction = getOrientation(newGridPoints);

        //take the longest lines of a rectangle in a feature collection and draw a turf line between them
        function polygonsToLines(currentFeature, featureIndex) {

            //ignore first feature (it's the buffer polygon)
            if (featureIndex === 0) {
                return;
            }

            let line;
            let line2;

            line = turf.lineString([currentFeature.geometry.coordinates[0][0], currentFeature.geometry.coordinates[0][1]]);
            line2 = turf.lineString([currentFeature.geometry.coordinates[0][2], currentFeature.geometry.coordinates[0][3]]);

            let firstLine = turf.lineIntersect(line, drawnAoI);
            let secondLine = turf.lineIntersect(line2, drawnAoI);

            //now the points are disorderly due to unpredictably running out of intersection points on each line, so we need to strictly sort them by initial direction logic

            //if the direction is north east, the coordinates entered should reflect that, then the second direction should be checked to be opposite and corrected if necessary
            if (firstLine.features.length > 0) {
                let lineA;
                let lineAStart = firstLine.features[0].geometry.coordinates;
                //let lineAEnd = firstLine.features[1].geometry.coordinates;
                let lineAEnd = firstLine.features[firstLine.features.length - 1].geometry.coordinates;

                if (direction === 'northeast') {
                    //confirm that first line actually goes northeast
                    if (lineAStart[0] < lineAEnd[0] && lineAStart[1] < lineAEnd[1]) {
                        lineA = turf.lineString([lineAStart, lineAEnd]);
                    } else {
                        lineA = turf.lineString([lineAEnd, lineAStart]);
                    }
                } else if
                (direction === 'southeast') {
                    //confirm that first line actually goes southeast
                    if (lineAStart[0] < lineAEnd[0] && lineAStart[1] > lineAEnd[1]) {
                        lineA = turf.lineString([lineAStart, lineAEnd]);
                    } else {
                        lineA = turf.lineString([lineAEnd, lineAStart]);
                    }
                } else if
                (direction === 'northwest') {
                    //confirm that first line actually goes northwest
                    if (lineAStart[0] > lineAEnd[0] && lineAStart[1] < lineAEnd[1]) {
                        lineA = turf.lineString([lineAStart, lineAEnd]);
                    } else {
                        lineA = turf.lineString([lineAEnd, lineAStart]);
                    }
                } else if
                (direction === 'southwest') {
                    //confirm that first line actually goes southwest
                    if (lineAStart[0] > lineAEnd[0] && lineAStart[1] > lineAEnd[1]) {
                        lineA = turf.lineString([lineAStart, lineAEnd]);
                    } else {
                        lineA = turf.lineString([lineAEnd, lineAStart]);
                    }
                } else {console.log('error in direction');}


            gridPointsCollection.features.push(lineA);
            }

            if (secondLine.features.length > 0) {
                let lineB;
                let lineBStart = secondLine.features[0].geometry.coordinates;
                //let lineBEnd = secondLine.features[1].geometry.coordinates;
                let lineBEnd = secondLine.features[secondLine.features.length - 1].geometry.coordinates;

                if (direction === 'northeast') {
                    //make sure lineB goes southwest this time
                    if (lineBStart[0] < lineBEnd[0] && lineBStart[1] < lineBEnd[1]) {
                        lineB = turf.lineString([lineBEnd, lineBStart]);
                    } else {
                        lineB = turf.lineString([lineBStart, lineBEnd]);
                    }
                }

                if (direction === 'southeast') {
                    //make sure lineB goes northeast this time
                    if (lineBStart[0] < lineBEnd[0] && lineBStart[1] > lineBEnd[1]) {
                        lineB = turf.lineString([lineBEnd, lineBStart]);
                    } else {
                        lineB = turf.lineString([lineBStart, lineBEnd]);
                    }
                }
                if (direction === 'northwest') {
                    //make sure lineB goes southeast this time
                    if (lineBStart[0] > lineBEnd[0] && lineBStart[1] < lineBEnd[1]) {
                        lineB = turf.lineString([lineBEnd, lineBStart]);
                    } else {
                        lineB = turf.lineString([lineBStart, lineBEnd]);
                    }
                }
                if (direction === 'southwest') {
                    //make sure lineB goes northeast this time
                    if (lineBStart[0] > lineBEnd[0] && lineBStart[1] > lineBEnd[1]) {
                        lineB = turf.lineString([lineBEnd, lineBStart]);
                    } else {
                        lineB = turf.lineString([lineBStart, lineBEnd]);
                    }
                }

            gridPointsCollection.features.push(lineB);
            }
        }

        turf.featureEach(newRectangleGridRotating, polygonsToLines);

        //console.log(newGridPointCollection.features, 'newGridPointCollection');

        map.removeLayer(lineLayer);
        lineSource.clear();
        let newGridPointCollectionMerc = turf.toMercator(gridPointsCollection);
        lineSource.addFeatures(new GeoJSON().readFeatures(newGridPointCollectionMerc)); //mercator change display
        lineLayer.setSource(lineSource);
        //map.addLayer(lineLayer);
        //console.log(lineLayer, 'lineLayer');

        map.removeLayer(firstPointLayer);
        firstPointSource.clear();

        map.removeLayer(lastPointLayer);
        lastPointSource.clear();

        if (gridPointsCollection.features.length > 0) {
        const firstPoint = turf.toMercator(turf.point(gridPointsCollection.features[0].geometry.coordinates[0])); //merc change
        const lastPoint = turf.toMercator(turf.point(gridPointsCollection.features[gridPointsCollection.features.length - 1].geometry.coordinates[1]));
        firstPointSource.addFeatures(new GeoJSON().readFeatures(firstPoint));
        firstPointLayer.setSource(firstPointSource);
        lastPointSource.addFeatures(new GeoJSON().readFeatures(lastPoint));
        lastPointLayer.setSource(lastPointSource);
        map.addLayer(firstPointLayer);
        map.addLayer(lastPointLayer);
        //createDistanceCsvFile(drawnHomePoint, newGridPointCollection);
        }

        //console.clear();

        let photoDistance = getDistance(currentGsd, sensorWidth, focalLength, imageWidth);
        //console.log(`photo distance: ${photoDistance}m`);

        //NOW WE HAVE A FEATURE COLLECTION WITH ALL THE POINTS THAT SHOULD BE IN LOGICAL ORDER
        function logCoords(featureCollection) {
            let xCoords = [];
            let yCoords = [];
        for (let i = 0; i < featureCollection.features.length; i++) {
            //if i is even it's normal, if odd it's reversed? For testing
            //if (i % 2 === 0) {
        xCoords.push(featureCollection.features[i].geometry.coordinates[0][0]);
        yCoords.push(featureCollection.features[i].geometry.coordinates[0][1]);
        xCoords.push(featureCollection.features[i].geometry.coordinates[featureCollection.features[i].geometry.coordinates.length - 1][0]);
        yCoords.push(featureCollection.features[i].geometry.coordinates[featureCollection.features[i].geometry.coordinates.length - 1][1]);
            //} else {
        //xCoords.push(featureCollection.features[i].geometry.coordinates[featureCollection.features[i].geometry.coordinates.length - 1][0]);
        //yCoords.push(featureCollection.features[i].geometry.coordinates[featureCollection.features[i].geometry.coordinates.length - 1][1]);
        //xCoords.push(featureCollection.features[i].geometry.coordinates[0][0]);
        //yCoords.push(featureCollection.features[i].geometry.coordinates[0][1]);
            //}
            }
            //console.log(xCoords);
            //console.log(yCoords);
        }
        logCoords(gridPointsCollection);

        //calculate the distance between the first point of the first line and the second point of the second line
        let lineSpace = turf.lineString([gridPointsCollection.features[0].geometry.coordinates[0], gridPointsCollection.features[1].geometry.coordinates[1]]);
        let lineSpaceDistance = turf.length(lineSpace, {units: 'meters'});
        //console.log(`line space distance: ${lineSpaceDistance}m`);


        gridPointsSource.addFeatures(new GeoJSON().readFeatures(turf.toMercator(newGridPoints))); //merc change
        rectangleGridSource.addFeatures(new GeoJSON().readFeatures(turf.toMercator(newRectangleGridRotating)));
        rectangleGridLayer.setSource(rectangleGridSource);
        //map.addLayer(rectangleGridLayer);
        gridPointsLayer.setSource(gridPointsSource);

        function drawPhotoRectangles(currentFeature, featureIndex) {
  
            let firstPhotoPoint;
            //let lastPhotoPoint;
            let firstLowerLeftCorner;
            //let lastLowerLeftCorner
            let firstUpperLeftCorner;
            //let lastUpperLeftCorner;
            let firstUpperRightCorner;
            //let lastUpperRightCorner;
            let firstLowerRightCorner;
            //let lastLowerRightCorner;
            let firstPhotoRectangle;
            //let lastPhotoRectangle;
  
            let widthInMetres = currentGsd/1000*imageWidth/100;
            let heightInMetres = currentGsd/1000*imageHeight/100;
            let widthInDegrees = turf.lengthToDegrees(widthInMetres, 'metres');
            let heightInDegrees = turf.lengthToDegrees(heightInMetres, 'metres');
  
            //console.log(widthInMetres, 'imageWidthInMetres');
            //console.log(heightInMetres, 'imageHeightInMetres');
            //console.log(widthInDegrees, 'imageWidthInDegrees');
            //console.log(heightInDegrees, 'imageHeightInDegrees');
  
            //console.log(currentFeature, 'currentFeature');
  
            firstPhotoPoint = currentFeature.geometry.coordinates;
            //console.log(firstPhotoPoint, 'firstPhotoPoint');
            //lastPhotoPoint = currentFeature.geometry.coordinates[1];
  
            firstLowerLeftCorner = [firstPhotoPoint[0] - widthInDegrees/2, firstPhotoPoint[1] - (heightInDegrees)/2*Math.cos(firstPhotoPoint[1]*Math.PI/180)];
            firstUpperLeftCorner = [firstPhotoPoint[0] - widthInDegrees/2, firstPhotoPoint[1] + heightInDegrees/2*Math.cos(firstPhotoPoint[1]*Math.PI/180)];
            firstUpperRightCorner = [firstPhotoPoint[0] + widthInDegrees/2, firstPhotoPoint[1] + heightInDegrees/2*Math.cos(firstPhotoPoint[1]*Math.PI/180)];
            firstLowerRightCorner = [firstPhotoPoint[0] + widthInDegrees/2, firstPhotoPoint[1] - heightInDegrees/2*Math.cos(firstPhotoPoint[1]*Math.PI/180)];
  
            firstPhotoRectangle = turf.polygon([[
                firstLowerLeftCorner,
                firstUpperLeftCorner,
                firstUpperRightCorner,
                firstLowerRightCorner,
                firstLowerLeftCorner
            ]]);
  
            //console.log(turf.length(firstPhotoRectangle, {units: 'metres'}), 'firstPhotoRectangleLength');
  
            let firstPhotoRectangleScaled = turf.transformScale(firstPhotoRectangle, 1/Math.cos(firstPhotoPoint[1]*Math.PI/180));
  
            //console.log(turf.length(firstPhotoRectangleScaled, {units: 'metres'}), 'firstPhotoRectangleScaledLength');
  
            let firstPhotoRotated = turf.transformRotate(firstPhotoRectangleScaled, currentRotation);
            //let lastPhotoRotated = turf.transformRotate(lastPhotoRectangleScaled, currentRotation);
  
            newPhotoCollection.features.push(turf.toMercator(firstPhotoRotated));
        }
        //console.log(photoSet, 'photoSet');

        function printAllPointsFromLines(olSource) {
            let features = olSource.getFeaturesCollection().getArray();
            let featuresArray = [];
            let featuresXArray = [];
            let featuresYArray = [];

            for (let i = 0; i < features.length; i++) {
                let feature = features[i];
                featuresArray.push(feature.getGeometry().getCoordinates());
            }

            for (let i = 0; i < featuresArray.length; i++) {
                let firstFeatureX = featuresArray[i][0][0];
                let secondFeatureX = featuresArray[i][1][0];
                featuresXArray.push(firstFeatureX);
                featuresXArray.push(secondFeatureX);
            }

            for (let i = 0; i < featuresArray.length; i++) {
                let firstFeatureY = featuresArray[i][0][1];
                let secondFeatureY = featuresArray[i][1][1];
                featuresYArray.push(firstFeatureY);
                featuresYArray.push(secondFeatureY);
            }

            return {featuresXArray, featuresYArray};
        }
        printAllPointsFromLines(lineSource);
        //map.addLayer(gridPointsLayer);

        function connectDots() {
            map.removeLayer(photosLayer);
            photosSource.clear();

            map.removeLayer(gridLinesLayer);
            gridLinesSource.clear();

            map.removeLayer(photoPointsLayer);
            photoPointsSource.clear();

            map.removeLayer(stopPointsLayer);
            stopPointsSource.clear();
            
            traverseDistance = 0;       
            let gridPoints = printAllPointsFromLines(lineSource);
            let gridLines = [];
            let gridLine = [];
            let stopPoints = [];
            let lineLength;
    
            for (let i = 0; i < gridPoints['featuresXArray'].length; i++) {
                let currentPoint = [gridPoints['featuresXArray'][i], gridPoints['featuresYArray'][i]];
                //console.log(currentPoint, 'currentPoint');
                let nextPoint = [gridPoints['featuresXArray'][i+1], gridPoints['featuresYArray'][i+1]];
                //console.log(nextPoint, 'nextPoint');    
                if (nextPoint != undefined) {
                    gridLine = turf.lineString([currentPoint, nextPoint]);
                    gridLines.push(gridLine);
                    lineLength = turf.length(turf.toWgs84(gridLine), {units: 'metres'});
                    if (lineLength > 0) {
                    traverseDistance += lineLength;
                    //console.log(traverseDistance, `traverseDistance: ${i}`);
                    }
                } else {
                    break;
                }
            }
            let gridLineCollection = turf.featureCollection(gridLines);
            //console.log(gridLineCollection, 'grid Lines Collection');
            gridLinesSource.addFeatures(new GeoJSON().readFeatures(gridLineCollection));
            gridLinesLayer.setSource(gridLinesSource);
            //console.log(gridLinesSource.getFeatures(), 'gridLinesSource');
            map.addLayer(gridLinesLayer);

            let photoPoints = frontlapDistance(gridPointsCollection)[0];
            //console.log(photoPoints, 'photoPoints');
            photoPointsSource.addFeatures(new GeoJSON().readFeatures(turf.toMercator(photoPoints)));
            photoPointsLayer.setSource(photoPointsSource);

            let stopPointCollection = frontlapDistance(gridPointsCollection)[1];
            stopPointsSource.addFeatures(new GeoJSON().readFeatures(turf.toMercator(stopPointCollection)));
            stopPointsLayer.setSource(stopPointsSource);

            turf.featureEach(photoPoints, drawPhotoRectangles);
            let colourFeatures = new GeoJSON().readFeatures(newPhotoCollection);
            colourFeatures.forEach(f => {
                //get index of feature in colourFeatures
                let index = colourFeatures.indexOf(f);
                //console.log(f);
                //console.log(index);
                if (index % 2 == 0) {
                    f.setStyle(new Style({
                        fill: new Fill({
                            color: 'rgba(0, 255, 0, 0.1)'
                        }),
                        stroke: new Stroke({
                            color: 'rgba(0, 0, 0, 0.8)',
                            width: 1
                        }),
                        zIndex: 110
                    }));
                } else {
                    f.setStyle(new Style({
                        fill: new Fill({
                            color: 'rgba(255, 0, 0, 0.1)'
                        }),
                        stroke: new Stroke({
                            color: 'rgba(0, 0, 0, 0.8)',
                            width: 1
                        }),
                        zIndex: 110
                    }));
                }
            });
            photosSource.addFeatures(colourFeatures);
            //photosSource.addFeatures(new GeoJSON().readFeatures(newPhotoCollection));
            photosLayer.setSource(photosSource);
            if (photoLayerOn == 1){
                map.removeLayer(photosLayer);
                map.addLayer(photosLayer);
            }
            map.addLayer(photoPointsLayer);
            map.addLayer(stopPointsLayer);
            //console.log(photoPoints, 'photo points variable');
            //console.log(photoPointsSource.getFeatures(), 'photopoints source');
            minTime.innerHTML = `🕓 > ${Math.ceil((((traverseDistance+firstAndLastLineDistance)/(currentSpeed/10))/60)*1.5)+2}min`; //+2 for takeoff and landing, *1.5 for variance
            totalDistance.innerHTML = `📐: ${((traverseDistance+firstAndLastLineDistance)/1000).toPrecision(3)}km | ${(((traverseDistance+firstAndLastLineDistance)*3.28084)*0.000189394).toPrecision(3)}mi`;
            return traverseDistance;
        }

        //console.log(drawnHomePoint, 'drawnHomePoint');

        async function drawFirstAndLastLines() {
            if (drawnHomePoint) {
            map.removeLayer(firstAndLastLinesLayer);
            firstAndLastLinesSource.clear();
            firstAndLastLineDistance = 0;
            let homePointOrigin = turf.point(homePointWgs84.geometry.coordinates);
            //console.log(homePoint, 'homePoint');
            //let homePointMerc = turf.toMercator(homePoint);

            let firstPoint = turf.point(gridPointsCollection.features[0].geometry.coordinates[0]);
            //let firstPointMerc = turf.toMercator(firstPoint);

            let lastPoint = turf.point(gridPointsCollection.features[gridPointsCollection.features.length-1].geometry.coordinates[1]);
            //let lastPointMerc = turf.toMercator(lastPoint);

            let firstLine = turf.lineString([homePointOrigin.geometry.coordinates, firstPoint.geometry.coordinates]);
            //console.log(firstLine, 'firstLine');
            firstLineHeading = (parseInt(turf.bearing(homePointOrigin, firstPoint))+360)%360;
            let lastLine = turf.lineString([homePointOrigin.geometry.coordinates, lastPoint.geometry.coordinates]);
            //console.log(lastLine, 'lastLine');
            let firstAndLastLineCollection = turf.toMercator(turf.featureCollection([firstLine, lastLine]));
            firstAndLastLinesSource.addFeatures(new GeoJSON().readFeatures(firstAndLastLineCollection));
            firstAndLastLinesLayer.setSource(firstAndLastLinesSource);
            map.addLayer(firstAndLastLinesLayer);
            firstAndLastLineDistance = turf.length(firstLine, {units: 'metres'}) + turf.length(lastLine, {units: 'metres'});
            //console.log(firstAndLastLineDistance, 'firstAndLastLineDistance');
            totalDistance.innerHTML = `📐: ${((traverseDistance+firstAndLastLineDistance)/1000).toPrecision(3)}km | ${(((traverseDistance+firstAndLastLineDistance)*3.28084)*0.000189394).toPrecision(3)}mi`;
            //console.log(firstAndLastLineDistance, 'firstAndLastLineDistance');
            //console.log(firstLineHeading, 'firstLineHeading');
            }
        }
        await drawFirstAndLastLines();


        //console.log(currentGsd/1000, 'currentGsd');
        //console.log(imageWidth, 'imageWidth');
        //console.log(sidelapDistance, 'sidelapDistance');
        ////console.log(turf.to)
        //console.log(imageHeight, 'imageHeight');
        //console.log(currentRotation, 'currentRotation');
        //console.log(currentSidelap, 'currentSidelap');
        //console.log(currentNudge, 'currentNudge');
        connectDots();
        //console.log(`total traverse distance: ${traverseDistance} + ${firstAndLastLineDistance} = ${traverseDistance + firstAndLastLineDistance} metres`);
        //console.log(stopPointsSource, 'stopPointsLayer');
    }
}
onload = init;
