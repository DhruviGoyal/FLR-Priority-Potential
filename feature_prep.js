
/*  HELPERS */

// Load a single-band raster
function loadRaster(assetId, bandName, scale) {
  return ee.Image(assetId)
    .rename(bandName)
    .reproject({ crs: 'EPSG:4326', scale: scale });
}

// Load an ImageCollection from a folder of images
function getImgCollection(folderPath) {
  var assetList = ee.data.getList({ id: folderPath });
  
  var imageList = assetList.map(function(asset) {
    return ee.Image(asset.id);
  });
  
  return ee.ImageCollection.fromImages(ee.List(imageList));
}

// Load and mosaic an ImageCollection
function loadMosaic(path, bandName, scale) {
  return getImgCollection(path)
    .mosaic()
    .rename(bandName)
    .reproject({ crs: 'EPSG:4326', scale: scale });
}

// One-hot encoding
function oneHotEncode(image, bandName, classValues) {
  var empty = ee.Image(0).select([]);
  var classes = ee.List(classValues);
  var oneHot = ee.Image(
    classes.iterate(function (c, img) {
      c = ee.Number(c);
      img = ee.Image(img);

      var band = image
        .eq(ee.Image.constant(c))
        .rename(
          ee.String(bandName)
            .cat('_class_')
            .cat(c.format('%d'))
        );

      return img.addBands(band);
    }, empty)
  );

  return oneHot;
}

// Bin continuous image into n bins
function binImage(image, vmin, vmax, n) {
  vmin = ee.Number(vmin);
  vmax = ee.Number(vmax);
  n = ee.Number(n);
  var bw = ee.Number(vmax).subtract(vmin).divide(n);
  var out = image.subtract(vmin).divide(bw).floor().add(1).toInt();
  return out.where(out.lt(1), 1).where(out.gt(n), n);
}

// Build aspect trig images
function aspectTrig(aspectImg) {
  var rad = aspectImg.multiply(Math.PI / 180);
  return ee.Image.cat([
    rad.sin().rename('aspect_sin'),
    rad.cos().rename('aspect_cos')
  ]);
}

// Bin aspect and one-hot encode
function aspectOneHot(aspectImg, nBins) {
  nBins = ee.Number(nBins);
  var binned = binImage(aspectImg, 0, 360, nBins)
    .rename(ee.String('aspect_').cat(nBins.format('%d')));
  var classes = ee.List.sequence(1, nBins);

  // Start with an empty image and add bands iteratively
  var empty = ee.Image(0).select([]);
  var oneHot = ee.Image(
    classes.iterate(function (c, img) {
      c = ee.Number(c);
      img = ee.Image(img);

      var band = binned
        .eq(ee.Image.constant(c))
        .rename(
          ee.String('aspect_')
            .cat(nBins.format('%d'))
            .cat('_class_')
            .cat(c.format('%d'))
        );

      return img.addBands(band);
    }, empty)
  );

  return oneHot;
}

// Aspect feature construction
function buildAspectFeatures(aspectImg, options) {
  options = options || {};
  var bins = options.bins || [4];
  var includeTrig = (options.includeTrig !== true);
  var img = ee.Image(0).select([]);

  if (includeTrig) {
    img = img.addBands(aspectTrig(aspectImg));
  }
  bins.forEach(function (n) {
    img = img.addBands(aspectOneHot(aspectImg, n));
  });
  return img;
}

// Apply band weights (expects exact band names)
function applyBandWeights(image, weights) {
  if (!weights) return image;
  weights = ee.Dictionary(weights);
  var bands = image.bandNames();

  var weightedList = bands.map(function (b) {
    b = ee.String(b);
    var w = ee.Number(
      ee.Algorithms.If(
        weights.contains(b),
        weights.get(b),
        1
      )
    );
    return image.select(b).multiply(w);
  });

  var weightedImage = ee.ImageCollection
    .fromImages(weightedList)
    .toBands()
    .rename(bands);
  return weightedImage;
}

// Min–max normalization
function normalizeBands(image, roi, scale) {
  image = image.clip(roi.geometry());

  var stats = image.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: roi.geometry(),
    scale: scale,
    maxPixels: 1e13
  });

  var bands = image.bandNames();

  var mins = bands.map(function (b) {
    return ee.Number(stats.get(ee.String(b).cat('_min')));
  });

  var maxs = bands.map(function (b) {
    return ee.Number(stats.get(ee.String(b).cat('_max')));
  });

  var minImg = ee.Image.constant(mins).rename(bands);
  var maxImg = ee.Image.constant(maxs).rename(bands);

  return image
    .subtract(minImg)
    .divide(maxImg.subtract(minImg))
    .rename(bands.map(function (b) {
      return ee.String(b).cat('_norm');
    }));
}

// Remap an image according to JS dict mapping
// Used to map AWC codes to real values
function remapCodes(image, bandName, mapping) {
  var from = [];
  var to = [];
  Object.keys(mapping).forEach(function (k) {
    from.push(parseInt(k, 10));
    to.push(mapping[k]);
  });
  
  return image.select(bandName).remap(from, to).rename(bandName);
}

// Temperature feature construction
function buildTemperatureFeatures(tempAsset, scale) {
  var indiaMeanDiurnal = getImgCollection(tempAsset);
  
  var rabiImage = indiaMeanDiurnal.filter(ee.Filter.eq('season', 'rabi')).mosaic().reproject({crs: 'EPSG:4326', scale: scale});
  var kharifImage = indiaMeanDiurnal.filter(ee.Filter.eq('season', 'kharif')).mosaic().reproject({crs: 'EPSG:4326', scale: scale});
  var zaidImage = indiaMeanDiurnal.filter(ee.Filter.eq('season', 'zaid')).mosaic().reproject({crs: 'EPSG:4326', scale: scale});
  return rabiImage.addBands([kharifImage, zaidImage]);
}

/* FEATURE REGISTRY */

// AWC mapping from codes to values
var AWC_CODE_MAP = {
  1: 150, // mm/m
  2: 125,
  3: 100,
  4: 75,
  5: 50,
  6: 15,
  7: 0
};

// Mapping from feature to function that returns ee.Image of feature
var FEATURE_BUILDERS = {

  elevation: function (cfg) {
    return loadRaster(
      cfg.assets.elevation,
      'elevation',
      cfg.scale
    );
  },

  meanElevation: function (cfg) {
    return loadRaster(
      cfg.assets.meanElevation,
      'meanElevation',
      cfg.scale
    );
  },

  slope: function (cfg) {
    return loadRaster(
      cfg.assets.slope,
      'slope',
      cfg.scale
    );
  },

  aspect: function (cfg) {
    var aspect = loadRaster(
      cfg.assets.aspect,
      'aspect',
      cfg.scale
    );
    return buildAspectFeatures(aspect, cfg.aspectOptions);
  },

  distToWater: function (cfg) {
    return loadMosaic(
      cfg.assets.distToWater,
      'dist_to_water',
      cfg.scale
    );
  },

  pH: function (cfg) {
    return ee.Image(cfg.assets.pH)
      .rename('pH')
      .reproject({ crs: 'EPSG:4326', scale: cfg.scale });
  },

  texture: function (cfg) {
    var tex = ee.Image(cfg.assets.texture)
      .rename('texture')
      .reproject({ crs: 'EPSG:4326', scale: cfg.scale });

    return oneHotEncode(tex, 'texture', cfg.textureClasses);
  },
  
  awc: function (cfg) {
    var awcCodes = ee.Image(cfg.assets.awc)
      .rename('awc_code')
      .reproject({ crs: 'EPSG:4326', scale: cfg.scale });

    return remapCodes(awcCodes, 'awc_code', AWC_CODE_MAP)
      .rename('awc');
  },

  drainage: function (cfg) {
    return ee.Image(cfg.assets.drainage)
      .rename('drainage')
      .reproject({ crs: 'EPSG:4326', scale: cfg.scale });
  },

  rainfall: function(cfg) {
    return loadMosaic(
      cfg.assets.rainfall,
      ['annual_rainfall', 'wet_months'],
      cfg.scale
    );
  },
  
  temperature: function(cfg) {
    return buildTemperatureFeatures(
      cfg.assets.temperature,
      cfg.scale
    );
  }
};



/* Feature Prep API */

// Build raw (unnormalized, unclipped) feature image
exports.buildInputImage = function (config) {
  var imgs = config.features.map(function (name) {
    return FEATURE_BUILDERS[name](config);
  });

  var image = ee.Image.cat(imgs);
  return image;
};

// Normalize, clip and weight bands
exports.prepareForClustering = function (image, roi, scale, bandWeights) {
  var img = normalizeBands(image, roi, scale)
    .clip(roi.geometry());
  img = applyBandWeights(img, bandWeights);
  return img;
};


/* ROI Prep API */

// Build ROI FC from SNIC superpixels
exports.snicSuperpixelROIsFC = function(acz, snicIds) {
  var aczList = [
  'Eastern Plateau & Hills Region',
  'Southern Plateau and Hills Region',
  'East Coast Plains & Hills Region',
  'Western Plateau and Hills Region',
  'Central Plateau & Hills Region',
  'West Coast Plains & Ghat Region',
  'Lower Gangetic Plain Region',
  'Middle Gangetic Plain Region',
  'Eastern Himalayan Region',
  'Western Himalayan Region',
  'Upper Gangetic Plain Region',
  'Trans Gangetic Plain Region',
  'Gujarat Plains & Hills Region',
  'Western Dry Region'
  ];
  var aczAcronymDict = {
    'Eastern Plateau & Hills Region': 'EPAHR',
    'Southern Plateau and Hills Region': 'SPAHR',
    'East Coast Plains & Hills Region': 'ECPHR',
    'Western Plateau and Hills Region': 'WPAHR',
    'Central Plateau & Hills Region': 'CPAHR',
    'West Coast Plains & Ghat Region': 'WCPGR',
    'Lower Gangetic Plain Region': 'LGPR',
    'Middle Gangetic Plain Region': 'MGPR',
    'Upper Gangetic Plain Region': 'UGPR',
    'Trans Gangetic Plain Region': 'TGPR',
    'Eastern Himalayan Region': 'EHR',
    'Western Himalayan Region': 'WHR',
    'Gujarat Plains & Hills Region': 'GPHR',
    'Western Dry Region': 'WDR'
  };

  var india = ee.FeatureCollection('projects/ee-mtpictd/assets/harsh/Agroclimatic_regions');

  var aczRoi = india.filter(ee.Filter.eq('regionname', acz)).first();
  var snicPath ='projects/ee-mtpictd/assets/anoushka/snic_clusters/'+aczAcronymDict[acz];
  var snicClusters = ee.Image(snicPath).rename('clusters').toInt();

  // Vectorize SNIC
  var snicFC = snicClusters.select('clusters')
    .reduceToVectors({
      geometry: aczRoi.geometry(),
      scale: 5000,
      eightConnected: true,
      labelProperty: 'snic_id'
    });

  // Filter only requested SNIC IDs
  // If snicIds not provided then return all
  var useFilter =
    snicIds !== undefined &&
    snicIds !== null &&
    snicIds.length > 0;

  var outFC = useFilter
    ? snicFC.filter(
        ee.Filter.inList(
          'snic_id',
          ee.List(snicIds).map(ee.Number.parse)
        )
      )
    : snicFC;

  return outFC.map(function (f) {
    var id = ee.Number(f.get('snic_id')).format('%d');
    var roiId = ee.String(aczAcronymDict[acz])
      .cat('_snic_')
      .cat(id);
    return f.set({
      roi_id: roiId,
      acz: acz
    });
  });
}

// Build ROI FC by intersecting SNIC superpixels and soil types
exports.snicToSoilRoisFC = function(snicRoisFC, soilFC) {
  var expanded = snicRoisFC.map(function (snicFeat) {
    // Get SNIC superpixel geometry
    var snicGeom = snicFeat.geometry();
    var snicId = snicFeat.get('roi_id');
    var intersectingSoils = soilFC.filterBounds(snicGeom);

    // Clip each soil polygon to SNIC superpixel
    return intersectingSoils.map(function (soilFeat) {
      var soilGeom = soilFeat.geometry();

      var clipped = soilGeom.intersection(snicGeom, ee.ErrorMargin(1));

      // Soil Mapping Unit Number, unique to an FAO polygon
      // So this soil polygon is fully identified by snicId + SNUM
      var soilId = soilFeat.get('SNUM');
      
      return ee.Feature(clipped, {
        roi_id: ee.String(snicId)
          .cat('_SNUM_')
          .cat(ee.String(soilId)),
        parent_snic: snicId,
        soil_id: soilId
      });
    });
  });
  
  // expanded is FeatureCollection<FeatureCollection>
  return expanded.flatten();
}



// // Testing

// // Build raw (unnormalized) feature image
// var buildInputImage = function (config) {
//   var imgs = config.features.map(function (name) {
//     return FEATURE_BUILDERS[name](config);
//   });
  
//   var image = ee.Image.cat(imgs);
//   return applyBandWeights(image, config.bandWeights);
// };

// // Normalize + clip (last step before clustering)
// var prepareForClustering = function (image, roi, scale) {
//   return normalizeBands(image, roi, scale)
//     .clip(roi.geometry());
// };


// // Configuration

// var FEATURE_CONFIG = {
//                   scale: 5000,
//                   features: [
//                     'rainfall',
//                     'temperature',
//                     'meanElevation',
//                   ],
//                   assets: {
//                     rainfall: 'projects/ee-mtpictd/assets/anoushka/annual_rainfall_wet_months_2000_2023',
//                     temperature: 'projects/ee-ictd-dhruvi/assets/anoushka/india_temp_2000_2023',
//                     meanElevation: 'projects/ee-mtpictd/assets/anoushka/india_elevation_5km',
//                   },
// };

// // Build inputs

// var rawInputs = buildInputImage(FEATURE_CONFIG);
// print(rawInputs);

// var Gaul = ee.FeatureCollection("FAO/GAUL_SIMPLIFIED_500m/2015/level2");
// var kolar = Gaul.filter(ee.Filter.eq("ADM2_NAME","Anantapur"));

// var inputs = prepareForClustering(
//   rawInputs,
//   kolar,
//   5000
// );

// print(inputs);

// var viz = require('users/mtpictd/anoushka:ecological_clustering/visualization');
// viz.visualizeInputs(
//   inputs,
//   kolar,
//   [],
//   ''
// );




