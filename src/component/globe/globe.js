import React, { Component } from 'react';
import * as THREE from 'three';
import GlobeContainer from './style';

const OrbitControls = require('three-orbitcontrols');
const MeshLine = require('three.meshline');

class GlobeModule extends Component {

  init = (data, opts) => {
    opts = opts || {};

    // Map properties for creation and rendering
    const props = {
      mapSize: {
        // Size of the map from the intial source image (on which the dots are positioned on)
        width: 2048 / 2,
        height: 1024 / 2
      },
      globeRadius: 200, // Radius of the globe (used for many calculations)
      dotsAmount: 20, // Amount of dots to generate and animate randomly across the lines
      startingCountry: "hongkong", // The key of the country to rotate the camera to during the introduction animation (and which country to start the cycle at)
      colours: {
        // Cache the colours
        globeDots: "#248b54", // No need to use the Three constructor as this value is used for the HTML canvas drawing 'fillStyle' property
        lines: new THREE.Color("#2e5831"),
        lineDots: new THREE.Color("#b8c8c1")
      },
      alphas: {
        // Transparent values of materials
        globe: 0.6,
        lines: 0.7
      }
    };
    // Booleans and values for animations
    const animations = {
      finishedIntro: false, // Boolean of when the intro animations have finished
      dots: {
        current: 0, // Animation frames of the globe dots introduction animation
        total: 170, // Total frames (duration) of the globe dots introduction animation,
        points: [] // Array to clone the globe dots coordinates to
      },
      globe: {
        current: 0, // Animation frames of the globe introduction animation
        total: 80 // Total frames (duration) of the globe introduction animation,
      },
      countries: {
        active: false, // Boolean if the country elements have been added and made active
        animating: false, // Boolean if the countries are currently being animated
        current: 0, // Animation frames of country elements introduction animation
        total: 120, // Total frames (duration) of the country elements introduction animation
        selected: null, // Three group object of the currently selected country
        index: null, // Index of the country in the data array
        timeout: null, // Timeout object for cycling to the next country
        initialDuration: 5000, // Initial timeout duration before starting the country cycle
        duration: 2000 // Timeout duration between cycling to the next country
      }
    };
    // Angles used for animating the camera
    const camera = {
      object: null, // Three object of the camera
      controls: null, // Three object of the orbital controls
      angles: {
        // Object of the camera angles for animating
        current: {
          azimuthal: null,
          polar: null
        },
        target: {
          azimuthal: null,
          polar: null
        }
      }
    };
    // Three group objects
    const groups = {
      main: null, // A group containing everything
      galaxy:null,
      outerLine1:null,
      outerLine2:null,
      outerLine3:null,
      globe: null, // A group containing the globe sphere (and globe dots)
      globeDots: null, // A group containing the globe dots
      lines: null, // A group containing the lines between each country
      lineDots: null // A group containing the line dots
    };

    var Shaders = {
      'earth' : {
        uniforms: {
          'texture': { type: 't', value: null }
        },
        vertexShader: [
          'varying vec3 vNormal;',
          'varying vec2 vUv;',
          'void main() {',
            'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
            'vNormal = normalize( normalMatrix * normal );',
            'vUv = uv;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform sampler2D texture;',
          'varying vec3 vNormal;',
          'varying vec2 vUv;',
          'void main() {',
            'vec3 diffuse = texture2D( texture, vUv ).xyz;',
            'float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );',
            'vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );',
            'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
          '}'
        ].join('\n')
      },
      'atmosphere' : {
        uniforms: {},
        vertexShader: [
          'varying vec3 vNormal;',
          'void main() {',
            'vNormal = normalize( normalMatrix * normal );',
            'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
          '}'
        ].join('\n'),
        fragmentShader: [
          'varying vec3 vNormal;',
          'void main() {',
            'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );',
            'gl_FragColor = vec4( 15.0, 15.0, 1.0, .2 ) * intensity;',
          '}'
        ].join('\n')
      }
    };
    var container = this.mount;
    var scene, renderer, w, h;
    let canvas;
    let globeElement,elements={};

    var overRenderer;

    var curZoomSpeed = 0;
    // var zoomSpeed = 50;

    var mouse = { x: 0, y: 0 }, mouseOnDown = { x: 0, y: 0 };
    var rotation = { x: 0, y: 0 },
      target = { x: Math.PI * 3 / 2, y: Math.PI / 6.0 },
      targetOnDown = { x: 0, y: 0 };

    var distance = 100000, distanceTarget = 100000;
    // var padding = 40;
    var PI_HALF = Math.PI / 2;

    let isHidden = false;

    var onMouseDown, onMouseMove, onMouseUp, onMouseOut, onMouseWheel, onDocumentKeyDown, onWindowResize, zoom;
    //declaration part over

    //events starts
    onMouseDown = function (event) {
      event.preventDefault();

      canvas.addEventListener('mousemove', onMouseMove, false);
      canvas.addEventListener('mouseup', onMouseUp, false);
      canvas.addEventListener('mouseout', onMouseOut, false);

      mouseOnDown.x = - event.clientX;
      mouseOnDown.y = event.clientY;

      targetOnDown.x = target.x;
      targetOnDown.y = target.y;

      canvas.style.cursor = 'move';
    }

    onMouseMove = function (event) {
      mouse.x = - event.clientX;
      mouse.y = event.clientY;

      var zoomDamp = distance / 1000;

      target.x = targetOnDown.x + (mouse.x - mouseOnDown.x) * 0.005 * zoomDamp;
      target.y = targetOnDown.y + (mouse.y - mouseOnDown.y) * 0.005 * zoomDamp;

      target.y = target.y > PI_HALF ? PI_HALF : target.y;
      target.y = target.y < - PI_HALF ? - PI_HALF : target.y;
    }

    onMouseUp = function (event) {
      canvas.removeEventListener('mousemove', onMouseMove, false);
      canvas.removeEventListener('mouseup', onMouseUp, false);
      canvas.removeEventListener('mouseout', onMouseOut, false);
      canvas.style.cursor = 'auto';
    }

    onMouseOut = function (event) {
      canvas.removeEventListener('mousemove', onMouseMove, false);
      canvas.removeEventListener('mouseup', onMouseUp, false);
      canvas.removeEventListener('mouseout', onMouseOut, false);
    }

    onMouseWheel = function (event) {
      event.preventDefault();
      if (overRenderer) {
        zoom(event.wheelDeltaY * 0.3);
      }
      return false;
    }

    onDocumentKeyDown = function (event) {
      switch (event.keyCode) {
        case 38:
          zoom(100);
          event.preventDefault();
          break;
        case 40:
          zoom(-100);
          event.preventDefault();
          break;
        default: { }
      }
    }

    onWindowResize = function (event) {
      const { innerWidth, innerHeight } = window;
      container.width = innerWidth;
      container.height = innerHeight;
      container.style.width = `${innerWidth}px`;
      container.style.height = `${innerHeight}px`;

      camera.object.aspect = container.offsetWidth / container.offsetHeight;
      camera.object.updateProjectionMatrix();
      renderer.setSize(container.offsetWidth, container.offsetHeight);
    }

    zoom = function (delta) {
      distanceTarget -= delta;
      distanceTarget = distanceTarget > 1000 ? 1000 : distanceTarget;
      distanceTarget = distanceTarget < 350 ? 350 : distanceTarget;
    }
    //events end

    //init start
    canvas = this.canvas;
    scene = new THREE.Scene();
    w = container.offsetWidth || window.innerWidth;
    h = window.innerHeight//container.offsetHeight || window.innerHeight;

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      shadowMapEnabled: false
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);

    // Main group that contains everything
    groups.main = new THREE.Group();
    groups.main.name = "Main";

    // Group that contains lines for each country
    groups.lines = new THREE.Group();
    groups.lines.name = "Lines";
    groups.main.add(groups.lines);

    // Group that contains dynamically created dots
    groups.lineDots = new THREE.Group();
    groups.lineDots.name = "Dots";
    groups.main.add(groups.lineDots);

    // Add the main group to the scene
    scene.add(groups.main);

    camera.object = new THREE.PerspectiveCamera(30, w / h, 1, 10000);
    camera.object.position.z = distance;

    // Set the initial camera angles to something crazy for the introduction animation
    camera.controls = new OrbitControls(camera.object, canvas);
    camera.angles.current.azimuthal = -Math.PI;
    camera.angles.current.polar = 0;
    onWindowResize();

    /* GLOBE */

    const addGlobe = () => {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.setCrossOrigin(true);

      const radius = props.globeRadius - props.globeRadius * 0.02;
      const segments = 32;
      const rings = 32;

      // Make gradient
      const canvasSize = 128;
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = canvasSize;
      textureCanvas.height = canvasSize;
      const canvasContext = textureCanvas.getContext("2d");
      canvasContext.rect(0, 0, canvasSize, canvasSize);
      const canvasGradient = canvasContext.createLinearGradient(
        0,
        0,
        0,
        canvasSize
      );
      canvasGradient.addColorStop(0, '#191717');
      canvasGradient.addColorStop(.5, '#010406');
      canvasGradient.addColorStop(1, '#191717');
      canvasContext.fillStyle = canvasGradient;
      canvasContext.fill();

      // Make texture

      const texture = new THREE.Texture(textureCanvas);
      texture.needsUpdate = true;

      const geometry = new THREE.SphereGeometry(radius, segments, rings);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0
      });
      material.side  = THREE.FrontSide;

      globeElement = new THREE.Mesh(geometry, material);
      globeElement.receiveShadow=true;
      globeElement.rotation.y = Math.PI;

      groups.globe = new THREE.Group();
      groups.globe.name = "Globe";

      groups.globe.add(globeElement);
      groups.main.add(groups.globe);

      let shader = Shaders['atmosphere'];
      let uniforms = THREE.UniformsUtils.clone(shader.uniforms);
  
      let mmaterial = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity:0.1
          });
  
      globeElement = new THREE.Mesh(geometry, mmaterial);
      globeElement.scale.set( 1.1, 1.1, 1.1 );
      groups.globe.add(globeElement);
     
      let geometry2 = new THREE.SphereGeometry(radius + 70, segments, rings);
      let material2 = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side:THREE.BackSide
      });
      // material2.side  = THREE.BackSide;

      globeElement = new THREE.Mesh(geometry2, material2);
      globeElement.receiveShadow = true;
      globeElement.rotation.y = Math.PI;

      groups.globe.add(globeElement);
      groups.main.add(groups.globe);
  
      globeElement = new THREE.Mesh(geometry2, mmaterial);
      globeElement.scale.set( 1.09, 1.07, 1.07 );
      groups.globe.add(globeElement);

      //line around globe
      geometry2 = new THREE.TorusGeometry( radius + 65, 0.55, 8, 100 );
      material2 = new THREE.MeshBasicMaterial( { color: 0x467747, transparent:true, opacity : 0.4 } );
      var torus = new THREE.Mesh( geometry2, material2 );
      torus.rotation.x = Math.PI/2;

      groups.outerLine1 = new THREE.Group();
      groups.outerLine1.name = "outerLine1";

      groups.outerLine1.add(torus);
      groups.main.add(groups.outerLine1);

      geometry2 = new THREE.TorusGeometry( radius + 65, 0.55, 8, 100 );
      material2 = new THREE.MeshBasicMaterial( { color: 0x467747, transparent:true, opacity : 0.4 } );
      torus = new THREE.Mesh( geometry2, material2 );
      torus.rotation.x = Math.PI;

      groups.outerLine2 = new THREE.Group();
      groups.outerLine2.name = "outerLine2";

      groups.outerLine2.add(torus);
      groups.main.add(groups.outerLine2);

      
      geometry2 = new THREE.TorusGeometry( radius + 65, 0.55, 8, 100 );
      material2 = new THREE.MeshBasicMaterial( { color: 0x467747, transparent:true, opacity : 0.4 } );
      torus = new THREE.Mesh( geometry2, material2 );
      torus.rotation.x = Math.PI / 1.5;

      groups.outerLine3 = new THREE.Group();
      groups.outerLine3.name = "outerLine3";

      groups.outerLine3.add(torus);
      groups.main.add(groups.outerLine3);


      //space background
     // create the geometry sphere
    //   var geometry2  = new THREE.SphereGeometry(600, 32, 32);
    //   var material2  = new THREE.MeshBasicMaterial()
    //   material2.map   = new THREE.TextureLoader().load(require('./starfield2_1900x1250.jpg'))
    //   material2.side  = THREE.BackSide
    //   var mesh  = new THREE.Mesh(geometry2, material2)
    //   groups.galaxy = new THREE.Group();
    //   groups.galaxy.name = "Galaxy";

    //   groups.galaxy.add(mesh);
    //   groups.main.add(groups.galaxy);

      addGlobeDots();
    };

    const returnSphericalCoordinates = (latitude, longitude) => {
      /*
              This function will take a latitude and longitude and calcualte the
              projected 3D coordiantes using Mercator projection relative to the
              radius of the globe.
      
              Reference: https://stackoverflow.com/a/12734509
          */

      // Convert latitude and longitude on the 90/180 degree axis
      latitude =
        ((latitude - props.mapSize.width) / props.mapSize.width) * -180;
      longitude =
        ((longitude - props.mapSize.height) / props.mapSize.height) * -90;

      // Calculate the projected starting point
      const radius = Math.cos((longitude / 180) * Math.PI) * props.globeRadius;
      const x = Math.cos((latitude / 180) * Math.PI) * radius;
      const y = Math.sin((longitude / 180) * Math.PI) * props.globeRadius;
      const z = Math.sin((latitude / 180) * Math.PI) * radius;

      return { x, y, z };
    };
    // Reference: https://codepen.io/ya7gisa0/pen/pisrm?editors=0010
    const returnCurveCoordinates = (
      latitudeA,
      longitudeA,
      latitudeB,
      longitudeB
    ) => {
      // Calculate the starting and end point
      const start = returnSphericalCoordinates(latitudeA, longitudeA);
      const end = returnSphericalCoordinates(latitudeB, longitudeB);

      // Calculate the mid-point
      const midPointX = (start.x + end.x) / 2;
      const midPointY = (start.y + end.y) / 2;
      const midPointZ = (start.z + end.z) / 2;

      // Calculate the distance between the two coordinates
      let distance = Math.pow(end.x - start.x, 2);
      distance += Math.pow(end.y - start.y, 2);
      distance += Math.pow(end.z - start.z, 2);
      distance = Math.sqrt(distance);

      // Calculate the multiplication value
      let multipleVal = Math.pow(midPointX, 2);
      multipleVal += Math.pow(midPointY, 2);
      multipleVal += Math.pow(midPointZ, 2);
      multipleVal = Math.pow(distance, 2) / multipleVal;
      multipleVal = multipleVal * 0.7;

      // Apply the vector length to get new mid-points
      const midX = midPointX + multipleVal * midPointX;
      const midY = midPointY + multipleVal * midPointY;
      const midZ = midPointZ + multipleVal * midPointZ;

      // Return set of coordinates
      return {
        start: {
          x: start.x,
          y: start.y,
          z: start.z
        },
        mid: {
          x: midX,
          y: midY,
          z: midZ
        },
        end: {
          x: end.x,
          y: end.y,
          z: end.z
        }
      };
    };

    // Returns an object of 2D coordinates for projected 3D position
    const getProjectedPosition = (width, height, position) => {
      /*
              Using the coordinates of a country in the 3D space, this function will
              return the 2D coordinates using the camera projection method.
          */

      position = position.clone();
      const { x, y } = position.project(camera.object);

      return {
        x: x * width + width,
        y: -(y * height) + height
      };
    };

    // Returns an object of the azimuthal and polar angles of a given map latitude and longitude
    const returnCameraAngles = (latitude, longitude) => {
      /*
              This function will convert given latitude and longitude coordinates that are
              proportional to the map dimensions into values relative to PI (which the
              camera uses as angles).
      
              Note that the azimuthal angle ranges from 0 to PI, whereas the polar angle
              ranges from -PI (negative PI) to PI (positive PI).
      
              A small offset is added to the azimuthal angle as angling the camera directly on top of a point makes the lines appear flat.
          */

      let azimuthal =
        ((latitude - props.mapSize.width) / props.mapSize.width) * Math.PI;
      azimuthal = azimuthal + Math.PI / 2;
      azimuthal = azimuthal + 0.1; // Add a small offset

      let polar = (longitude / (props.mapSize.height * 2)) * Math.PI;

      return { azimuthal, polar };
    };

    const addGlobeDots = () => {
      const geometry = new THREE.Geometry();

      // Make circle
      const canvasSize = 16;
      const halfSize = canvasSize / 2;
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = canvasSize;
      textureCanvas.height = canvasSize;
      const canvasContext = textureCanvas.getContext("2d");
      canvasContext.beginPath();
      canvasContext.arc(halfSize, halfSize, halfSize, 0, 2 * Math.PI);
      canvasContext.fillStyle = props.colours.globeDots;
      canvasContext.fill();

      // Make texture
      const texture = new THREE.Texture(textureCanvas);
      texture.needsUpdate = true;

      const material = new THREE.PointsMaterial({
        map: texture,
        size: props.globeRadius / 120
      });

      const addDot = function ({ x, y }) {
        // Add a point with zero coordinates
        const point = new THREE.Vector3(0, 0, 0);
        geometry.vertices.push(point);

        // Add the coordinates to a new array for the intro animation
        const result = returnSphericalCoordinates(x, y);
        animations.dots.points.push(
          new THREE.Vector3(result.x, result.y, result.z)
        );
      };

      for (let i = 0; i < data.points.length; i++) {
        addDot(data.points[i]);
      }

      for (let country in data.countries) {
        addDot(data.countries[country]);
      }

      // Add the points to the scene
      groups.globeDots = new THREE.Points(geometry, material);
      groups.globe.add(groups.globeDots);
    };

    addGlobe();

    canvas.addEventListener('mousedown', onMouseDown, false);

    container.addEventListener('mousewheel', onMouseWheel, false);

    canvas.addEventListener('mouseover', () => {
      overRenderer = true;
    }, false);

    canvas.addEventListener('mouseout', () => {
      overRenderer = false;
    }, false);

    document.addEventListener('keydown', onDocumentKeyDown, false);

    window.addEventListener('resize', onWindowResize, false);

    window.addEventListener("orientationchange", onWindowResize);
    
    //init over

    const easeInOutCubic = t =>
      t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    const easeOutCubic = t => --t * t * t + 1;
    const easeInOutQuad = t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

    const introAnimate = () => {
      const { dots, globe, countries } = animations;

      if (dots.current <= dots.total) {
        const points = groups.globeDots.geometry.vertices;
        const totalLength = points.length;

        for (let i = 0; i < totalLength; i++) {
          // Get ease value and add delay based on loop iteration
          let dotProgress = easeInOutCubic(dots.current / dots.total);
          dotProgress = dotProgress + dotProgress * (i / totalLength);

          if (dotProgress > 1) {
            dotProgress = 1;
          }

          // Move the point
          points[i].x = dots.points[i].x * dotProgress;
          points[i].y = dots.points[i].y * dotProgress;
          points[i].z = dots.points[i].z * dotProgress;

          // Animate the camera at the same rate as the first dot
          if (i === 0) {
            const { current, target } = camera.angles;

            const azimuthalDifference =
              (current.azimuthal - target.azimuthal) * dotProgress;
            // camera.controls.setAzimuthalAngle(
            //   current.azimuthal - azimuthalDifference
            // );

            const polarDifference =
              (current.polar - target.polar) * dotProgress;
            // camera.controls.setPolarAngle(current.polar - polarDifference);
          }
        }

        dots.current++;

        // Update verticies
        groups.globeDots.geometry.verticesNeedUpdate = true;
      }

        if (dots.current >= dots.total * 0.65 && globe.current <= globe.total) {
          const globeProgress = easeOutCubic(globe.current / globe.total);
          globeElement.material.opacity = props.alphas.globe * globeProgress;

          // Fade-in the country lines
          const lines = countries.selected.children;
          for (let ii = 0; ii < lines.length; ii++) {
            lines[ii].material.uniforms.opacity.value =
              props.alphas.lines * globeProgress;
          }

          globe.current++;
        }

        if (dots.current >= dots.total * 0.7 && !countries.active) {
          list.classList.add("active");

          const key = Object.keys(data.countries)[countries.index];
          changeCountry(key, true);

          countries.active = true;
        }

      // Start country cycle
      if (countries.active && !animations.finishedIntro) {
        animations.finishedIntro = true;
        countries.timeout = setTimeout(
          showNextCountry,
          countries.initialDuration
        );
        addLineDots();
      }
    };

    /* COUNTRY CYCLE */

    const changeCountry = (key, init) => {
      if (animations.countries.selected) {
        animations.countries.selected.visible = false;
      }

      for (const name in elements) {
        if (name === key) {
          elements[name].element.classList.add("active");
        } else {
          elements[name].element.classList.remove("active");
        }
      }

      // Show the select country lines
      animations.countries.selected = groups.lines.getObjectByName(key);
      animations.countries.selected.visible = true;

      if (!init) {        
        camera.angles.current.azimuthal = camera.controls.getAzimuthalAngle();
        camera.angles.current.polar = camera.controls.getPolarAngle();

        const { x, y } = data.countries[key];
        const { azimuthal, polar } = returnCameraAngles(x, y);
        camera.angles.target.azimuthal = azimuthal;
        camera.angles.target.polar = polar;

        animations.countries.animating = true;
        reassignDotsToNewLines();
      }
    };

    const animateCountryCycle = () => {
      const { countries } = animations;

      if (countries.current < countries.total) {
        const { current, target } = camera.angles;

        const progress = easeInOutQuad(countries.current / countries.total);

        const azimuthalDifference =
          (current.azimuthal - target.azimuthal) * progress;
        // camera.controls.setAzimuthalAngle(
        //   current.azimuthal - azimuthalDifference
        // );

        const polarDifference = (current.polar - target.polar) * progress;
        // camera.controls.setPolarAngle(current.polar - polarDifference);

        countries.current++;
      } else {
        countries.animating = false;
        countries.current = 0;
        countries.timeout = setTimeout(showNextCountry, countries.duration);
      }
    };

    const showNextCountry = () => {
      let { countries } = animations;

      countries.index++;
      if (countries.index >= Object.keys(data.countries).length) {
        countries.index = 0;
      }

      changeCountry(Object.keys(data.countries)[countries.index], false);
    };


    //Countries

    const addLines = () => {
      // Create the geometry
      const geometry = new THREE.Geometry();

      for (const countryStart in data.countries) {
        const group = new THREE.Group();
        group.name = countryStart;

        for (const countryEnd in data.countries) {
          // Skip if the country is the same
          if (countryStart === countryEnd) {
            continue;
          }

          // Get the spatial coordinates
          const { start, mid, end } = returnCurveCoordinates(
            data.countries[countryStart].x,
            data.countries[countryStart].y,
            data.countries[countryEnd].x,
            data.countries[countryEnd].y
          );

          // Calcualte the curve in order to get points from
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(start.x, start.y, start.z),
            new THREE.Vector3(mid.x, mid.y, mid.z),
            new THREE.Vector3(end.x, end.y, end.z)
          );

          // Get verticies from curve
          geometry.vertices = curve.getPoints(200);

          // Create mesh line using plugin and set its geometry
          const line = new MeshLine.MeshLine();
          line.setGeometry(geometry);

          // Create the mesh line material using the plugin
          const material = new MeshLine.MeshLineMaterial({
            color: props.colours.lines,
            transparent: true,
            opacity: props.alphas.lines
          });

          // Create the final object to add to the scene
          const curveObject = new THREE.Mesh(line.geometry, material);
          curveObject._path = geometry.vertices;

          group.add(curveObject);
        }

        group.visible = false;
        groups.lines.add(group);
      }
    };

    const addLineDots = () => {
      /*
              This function will create a number of dots (props.dotsAmount) which will then later be
              animated along the lines. The dots are set to not be visible as they are later
              assigned a position after the introduction animation.
          */

      const radius = props.globeRadius / 120;
      const segments = 32;
      const rings = 32;

      // Returns a sphere geometry positioned at coordinates
      const returnLineDot = () =>
        new THREE.Mesh(
          new THREE.SphereGeometry(radius, segments, rings),
          new THREE.MeshBasicMaterial({ color: props.colours.lineDots })
        );

      for (let i = 0; i < props.dotsAmount; i++) {
        // Get the country path geometry vertices and create the dot at the first vertex
        const targetDot = returnLineDot();
        targetDot.visible = false;

        // Add custom variables for custom path coordinates and index
        targetDot._pathIndex = null;
        targetDot._path = null;

        // Add the dot to the dots group
        groups.lineDots.add(targetDot);
      }
    };

    const assignDotsToRandomLine = target => {
      // Get a random line from the current country
      let randomLine =
        Math.random() * (animations.countries.selected.children.length - 1);
      randomLine =
        animations.countries.selected.children[randomLine.toFixed(0)];

      // Assign the random country path to the dot and set the index at 0
      target._path = randomLine._path;
    };

    const reassignDotsToNewLines = () => {
      for (let i = 0; i < groups.lineDots.children.length; i++) {
        const target = groups.lineDots.children[i];
        if (target._path && target._pathIndex) {
          assignDotsToRandomLine(target);
        }
      }
    };

    const animateDots = () => {
      // Loop through the dots children group
      for (let i = 0; i < groups.lineDots.children.length; i++) {
        const dot = groups.lineDots.children[i];

        if (!dot._path) {
          // Create a random seed as a pseudo-delay
          if (Math.random() > 0.99) {
            assignDotsToRandomLine(dot);
            dot._pathIndex = 0;
          }
        } else if (dot._path && dot._pathIndex < dot._path.length - 1) {
          // Show the dot
          if (!dot.visible) {
            dot.visible = true;
          }

          // Move the dot along the path vertice coordinates
          dot.position.x = dot._path[dot._pathIndex].x;
          dot.position.y = dot._path[dot._pathIndex].y;
          dot.position.z = dot._path[dot._pathIndex].z;

          // Advance the path index by 1
          dot._pathIndex++;
        } else {
          // Hide the dot and remove the path assingment
          dot.visible = false;
          dot._path = null;
        }
      }
    };

    /* ELEMENTS */

    let list;

    const createListElements = () => {
      list = this.jslist;//document.querySelector(".js-list");

      const pushObject = (coordinates, target) => {
        // Create the element
        const element = document.createElement("li");

        const { country } = data.countries[target];
        element.innerHTML = `<span class="text">${country}</span>`;

        const object = { position: coordinates, element };

        // Add the element to the DOM and add the object to the array
        list.appendChild(element);
        elements[target] = object;
      };

      // Loop through each country line
      let i = 0;
      for (const country in data.countries) {
        const group = groups.lines.getObjectByName(country);
        const coordinates = group.children[0]._path[0];
        pushObject(coordinates, country);

        if (country === props.startingCountry) {
          // Set the country cycle index and selected line object for the starting country
          animations.countries.index = i;
          animations.countries.selected = groups.lines.getObjectByName(country);

          // Set the line opacity to 0 so they can be faded-in during the introduction animation
          let { visible, children } = animations.countries.selected;
          visible = true;
          for (let ii = 0; ii < children.length; ii++) {
            children[ii].material.uniforms.opacity.value = 0;
          }

          // Set the target camera angles for the starting country for the introduction animation
          const { x, y } = data.countries[country];
          const { azimuthal, polar } = returnCameraAngles(x, y);
          camera.angles.target.azimuthal = azimuthal;
          camera.angles.target.polar = polar;
        } else {
          i++;
        }
      }
    };

    const positionElements = () => {
        const widthHalf = canvas.clientWidth / 2;
        const heightHalf = canvas.clientHeight / 2;

        // Loop through the elements array and reposition the elements
        for (const key in elements) {
            const { position, element } = elements[key];
            const { x, y } = getProjectedPosition(widthHalf, heightHalf, position);

            // Construct the 3D translate string
            const elementStyle = element.style;
            const styleString = `translate3D(${x}px, ${y}px, 0)`;
            elementStyle.webkitTransform = styleString;
            elementStyle.WebkitTransform = styleString; // For Safari
            elementStyle.mozTransform = styleString;
            elementStyle.msTransform = styleString;
            elementStyle.oTransform = styleString;
            elementStyle.transform = styleString;
        }
    };

    if (Object.keys(data.countries).length > 0) {
      addLines();
      createListElements();
    }


    //final animation
    var animate = function () {
      if (!isHidden) {
        requestAnimationFrame(animate);
      }

      if (groups.globeDots) {
        introAnimate();
      }

      if (animations.finishedIntro) {
        animateDots();
      }

      if (animations.countries.animating) {
          animateCountryCycle();
      }

      positionElements();

      zoom(curZoomSpeed);

      // groups.globe.rotation.x += 0.001;
      groups.outerLine1.rotation.y += 0.0009;
      groups.outerLine1.rotation.x += 0.0009;
      groups.outerLine2.rotation.y += 0.0009;
      groups.outerLine2.rotation.x += 0.0009;
      groups.outerLine3.rotation.y += 0.0009;
      groups.outerLine3.rotation.x += 0.0009;

      rotation.x += (target.x - rotation.x) * 0.1;
      rotation.y += (target.y - rotation.y) * 0.1;
      distance += (distanceTarget - distance) * 0.3;

      camera.object.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y);
      camera.object.position.y = distance * Math.sin(rotation.y);
      camera.object.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y);

      camera.object.lookAt(groups.globe.position);

      renderer.render(scene, camera.object);
    };

    animate();
  }

  componentDidMount() {
    const getData = async () => {
      const results = await fetch(
        "https://s3-us-west-2.amazonaws.com/s.cdpn.io/617753/globe-points.json"
      );
      let data = await results.json();
      return this.init(data);
    };
    getData();
  }

  render() {
    return (
      <GlobeContainer>
        <div className="globe js-globe" style={{background:"url("+require('./tycho8-2048x1024.jpg')+")"}} ref={ref => (this.mount = ref)} >
          <ul className="globe-list js-list" ref={ref => (this.jslist = ref)} />
          <canvas className="globe-canvas js-canvas" ref={ref => (this.canvas = ref)} />
        </div>
      </GlobeContainer>
    );
  }
}

export default GlobeModule;