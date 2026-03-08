
// Adds clustered image + legend to map
exports.visualizeClusters = function(clusterImg, k, title, addLegend, legendLeft) {
  addLegend = ((addLegend === undefined) ? false : addLegend);
  
  var fullPalette = [
    'e6194b', '3cb44b', 'ffe119', '0082c8', 'f58231',
    '911eb4', '46f0f0', 'f032e6', 'd2f53c', 'fabebe',
    '008080', 'e6beff', 'aa6e28', 'fffac8', '800000'
  ];
  
  var usedPalette = ee.List(fullPalette).slice(1, k+1).getInfo();
  
  var n = k;
  
  if (addLegend) {
    // Add a legend - apart from the one writing this!!! haha
    var legend = ui.Panel({
      style: {
        position: 'bottom-right',
        padding: '8px 15px'
      }
    });
    var legendTitle = ui.Label({
      value: title,
      style: {
        fontWeight: 'bold',
        fontSize: '14px',
        margin: '0 0 4px 0',
        padding: '0'
      }
    });
    legend.add(legendTitle);
    var makeRow = function(color, clusterId) {
      var colorBox = ui.Label({
        style: {
          backgroundColor: color,
          padding: '8px',
          margin: '0 0 4px 0'
        }
      });
      var description = ui.Label({
        value: 'Cluster ' + clusterId,
        style: {margin: '0 0 4px 6px'}
      });
    
      return ui.Panel({
        widgets: [colorBox, description],
        layout: ui.Panel.Layout.Flow('horizontal')
      });
    };
    
    for (var i = 0; i < n; i++) {
      legend.add(makeRow(usedPalette[i], i));
    }
    Map.add(legend);
  }
  
  Map.addLayer(clusterImg, {min: 0, max: n-1, palette: usedPalette}, title);
  Map.centerObject(clusterImg.geometry(), 8);
};

// Prints boxplots for each cluster
exports.boxPlotsForClusters = function(clusterImg, inputImg, k, roi, scale, title) {
  var img = inputImg.addBands(clusterImg);
  var samples = img.sample({
    region: roi.geometry(),
    scale: scale,
    geometries: false,
    numPixels: 5000,
    seed: 42
  });
  var clusterIds = ee.List.sequence(0,k-1);
  
  clusterIds.getInfo().forEach(function(clusterId) {
    var clusterSamples = samples.filter(ee.Filter.eq('cluster', clusterId));
    var pctReducer = ee.Reducer.percentile([0, 25, 50, 75, 100],
                                          ['p0','p25','p50','p75','p100']);
    
    var bandNames = inputImg.bandNames();
    var rows = bandNames.map(function(b) {
      var bandName = ee.String(b);
      var stats = ee.Dictionary(clusterSamples.reduceColumns({
        reducer: pctReducer,
        selectors: [bandName]
      }));
      return ee.Dictionary({
        c: [
          {v: b},               // feature name as x-axis label
          {v: stats.get('p50')},
          {v: stats.get('p0'),  role: 'interval'},
          {v: stats.get('p100'),role: 'interval'},
          {v: stats.get('p25'), role: 'interval'},
          {v: stats.get('p50'), role: 'interval'},
          {v: stats.get('p75'), role: 'interval'}
        ]
      });
    });
  
    rows.evaluate(function(rowsClient) {
      var dataTable = {
        cols: [
          {id: 'feature', label: 'Feature', type: 'string'},
          {id: 'median',  label: 'Median',  type: 'number'},
          {id: 'min',     type: 'number', role: 'interval'},
          {id: 'max',     type: 'number', role: 'interval'},
          {id: 'q1',      type: 'number', role: 'interval'},
          {id: 'medInt',  type: 'number', role: 'interval'},
          {id: 'q3',      type: 'number', role: 'interval'}
        ],
        rows: rowsClient
      };
  
      var options = {
        title: title + ' Cluster ' + clusterId,
        hAxis: {
          slantedText: true,
          slantedTextAngle: 45,
          showTextEvery: 1,   // force all labels
          textStyle: {fontSize: 12}
        },
        vAxis: {title: 'Normalized value (0–1)', viewWindow: {min: 0, max: 1}},
        legend: {position: 'none'},
        lineWidth: 0,
        intervals: {style: 'boxes', boxWidth: 1, barWidth: 1, lineWidth: 1},
        interval: {min: {style: 'bars'}, max: {style: 'bars'}}
      };

    var chart = ui.Chart(dataTable, 'LineChart', options, {width: 400, height: 600});
    print(chart);
  });
    
  });
};

// Visualize features and inputs

// Maps band names to visparams dictionaries
var VIS_PARAMS = {
  elevation: {
    min: 0, max: 5000,
    palette: ['006400', 'FFFF00', 'FF8C00', '8B0000']
  },
  meanElevation: {
    min: 0, max: 5000,
    palette: ['006400', 'FFFF00', 'FF8C00', '8B0000']
  },
  annual_rainfall: {
    min: 0,
    max: 5000,
    palette: ['white', 'lightblue', 'blue', 'darkblue', 'purple']
  },
  wet_months: {
    min: 0,
    max: 12,
    palette: ['#f7fcf5','#e5f5e0','#c7e9c0','#a1d99b','#74c476','#41ab5d','#238b45','#006d2c','#00441b','#003319','#00220f','#001204','#000000']
  },
  rabi_mean_temp: {
    min: 10,
    max: 35,
    palette: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c']  // blue → white → red
  },
  kharif_mean_temp: {
    min: 10,
    max: 35,
    palette: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c']  // blue → white → red
  },
  zaid_mean_temp: {
    min: 10,
    max: 35,
    palette: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c']  // blue → white → red
  },
  rabi_diurnal_temp: {
    min: 10,
    max: 35,
    palette: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c']  // blue → white → red
  },
  kharif_diurnal_temp: {
    min: 10,
    max: 35,
    palette: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c']  // blue → white → red
  },
  zaid_diurnal_temp: {
    min: 10,
    max: 35,
    palette: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c']  // blue → white → red
  },
  slope: {
    min: 0, max: 60,
    palette: ['white', 'yellow', 'orange', 'red']
  },
  aspect_sin: {
    min: -1, max: 1,
    palette: ['#313695', '#74add1', '#ffffbf', '#f46d43', '#a50026']
  },
  aspect_cos: {
    min: -1, max: 1,
    palette: ['#313695', '#74add1', '#ffffbf', '#f46d43', '#a50026']
  },
  aspect_2: {
    min: 1, max: 2,
    palette: ['red', 'blue']
  },
  aspect_4: {
    min: 1, max: 4,
    palette: ['red', 'yellow', 'green', 'blue']
  },
  aspect_6: {
    min: 1, max: 6,
    palette: ['red', 'orange', 'yellow', 'green', 'cyan', 'blue']
  },
  dist_to_water: {
    min: 0, max: 10000,
    palette: ['0000ff', '00ffff', 'ffff00', 'ff0000']
  },
  pH: {
    min: 4, max: 9,
    palette: ['red', 'yellow', 'green', 'blue']
  },
  texture: {
    min: 1, max: 3,
    palette: ['#f4a460', '#deb887', '#cd853f']
  },
  awc: {
    min: 0,
    max: 150,
    palette: [
      '#8c510a',  // very low AWC (dry, coarse soils)
      '#d8b365',
      '#f6e8c3',
      '#c7eae5',
      '#5ab4ac',
      '#01665e'   // very high AWC (fine, water-retentive soils)
    ]
  },
  drainage: {
    min: 0,
    max: 6,
    palette: [
      '#2c7bb6',  // 0 very poorly drained
      '#abd9e9',
      '#ffffbf',
      '#fdae61',
      '#d7191c',
      '#800026',
      '#4d004b'   // 6 excessively drained
    ]
  }
};

// Collapses one-hot bands prepended by 'prefix' into one image
function collapseOneHot(image, prefix) {

  var bands = image.bandNames()
    .filter(ee.Filter.stringStartsWith('item', prefix + '_class_'));

  var indices = bands.map(function (b) {
    b = ee.String(b);

    // Remove trailing "_norm" if present (regex, EE-safe)
    var clean = b.replace('_norm$', '');

    // Extract the class index after "_class_"
    var cls = clean.split('_class_').get(1);

    return ee.Number.parse(cls);
  });

  var weights = ee.Image.constant(indices);

  return image
    .select(bands)
    .multiply(weights)
    .reduce(ee.Reducer.sum())
    .rename(prefix);
}

// Add inputs to map with appropriate visparams
// oneHotPrefixes is a list of prefixes specifying all one-hot encoded bands
exports.visualizeInputs = function(image, roi, oneHotPrefixes, title) {
  title = title || '';
  oneHotPrefixes = oneHotPrefixes || [];

  var bandNames = image.bandNames();

  bandNames.evaluate(function (bands) {

    bands.forEach(function (b) {
      // Skip one-hot bands (handled later)
      var isOneHot = oneHotPrefixes.some(function (p) {
        return (
          b.indexOf(p + '_class_') === 0 ||
          b.indexOf(p + '_class_') === 0 && b.indexOf('_norm') === b.length - 5
        );
      });
      if (isOneHot) return;
      
      // Get visparams
      var baseName = b.replace('_norm', '');
      var vis = VIS_PARAMS[baseName];
      if (!vis) {
        print('No vis params for:', b);
        return;
      }

      var isNorm = b.indexOf('_norm') === b.length - 5;
      // If input band is normalized, min=0 and max=1, else use visparams directly
      var params = isNorm
        ? { min: 0, max: 1, palette: vis.palette }
        : vis;

      Map.addLayer(image.select(b).clip(roi), params, title + ' ' + b);
    });

    // One-hot groups
    oneHotPrefixes.forEach(function (prefix) {
      var collapsed = collapseOneHot(image, prefix);
      var vis = VIS_PARAMS[prefix];

      if (!vis) {
        print('No vis params for one-hot group:', prefix);
        return;
      }

      Map.addLayer(
        collapsed.clip(roi),
        vis,
        title + ' ' + prefix
      );
    });
  });
  
  Map.centerObject(roi, 4);
  
};



// // Testing

// var featurePrep = require('users/mtpictd/anoushka:ecological_clustering/feature_prep');

// // Configuration

// var FEATURE_CONFIG = {
//   scale: 100,

//   features: [
//     'elevation',
//     'slope',
//     'aspect',
//     'distToWater',
//     // 'pH',
//     // 'texture'
//   ],

//   assets: {
//     elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
//     slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
//     aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
//     distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
//     // pH: topsoilPH,
//     // texture: topsoilTexture
//   },

//   aspectOptions: {
//     bins: [2, 4, 6],
//     includeTrig: false
//   },

//   textureClasses: [1, 2, 3],
//   textureScale: 1,

//   // Band weighting (optional)
//   bandWeights: {
//     elevation: 1.0,
//     slope: 1.0,
//     aspect_sin: 0.5,
//     aspect_cos: 0.5,
//     dist_to_water: 1.2,
//     pH: 0.8,
//     texture_class_1: 0.3,
//     texture_class_2: 0.3,
//     texture_class_3: 0.3
//   }
// };

// // Build inputs

// var rawInputs = featurePrep.buildInputImage(FEATURE_CONFIG);
// // print(rawInputs);

// var Gaul = ee.FeatureCollection("FAO/GAUL_SIMPLIFIED_500m/2015/level2");
// var kolar = Gaul.filter(ee.Filter.eq("ADM2_NAME","Kolar"));
// var roi = kolar;

// var inputs = featurePrep.prepareForClustering(
//   rawInputs,
//   roi,
//   100
// );

// print(inputs);

// visualizeInputs(inputs, roi, ['aspect_2', 'aspect_4', 'aspect_6'], 'Testing ');

