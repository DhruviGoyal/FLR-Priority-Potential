# FLR-Priority-Potential
This repository contains code pipeline to assess Forest Landscape Restoration (FLR) priority scores for different types of sites, and assess the maximum restoration potential score if necessary interventions are undertaken.

# Introduction

This pipeline is divided into three parts:

1. **Forest Restoration Priority Score** : This generates a ‘priority score’ for suitability of
    restoration computed from underlying variables like risk of soil erosion, distance to forest
    edge etc. Separate maps are generated for deforested areas and intact/degraded
    forests, and filtering can also be done by the history of the area (e.g. how long it has
    been forested).
2. **Canopy Cover Density Estimation** : This generates a Canopy Density Classification
    map over India with 3 classes - High, Medium and Low.
**3. Ecological Clustering:** This generates ecologically similar clusters in an area of interest
    based on underlying variables like mean rainfall, temperature, elevation etc. The
    clustering is in three levels - on each ACZ, first, a coarse 5 km resolution clustering is
    done using SNIC Segmentation; second, these SNIC superpixels are further divided into
    polygons based on FAO soil type features; third, these soil polygons are clustered using
    K-Means.
You can find the links to all the scripts and assets here.

# Forest Restoration Priority Score

1. Generate underlying variables
    **a. Risk of soil erosion:** This map is available publicly as the IWED dataset and is
       an existing GEE asset. No computation necessary.
    **b. LTP_masks_and_derived_rasters.ipynb** : This Python notebook is used to
       generate the following layers at 100m resolution for 2023:
          i. LTP mask
ii. LTP area and perimeter
iii. Using LTP mask, Distance from Forest Edge
iv. Using LTP mask, LTP Interpatch Distance
    **c. settlement_rasters.ipynb:** This Python notebook is used to generate Distance
       from Settlements raster at 100m resolution for 2023. This raster is based on two
       datasets - WRIS’ settlement features (based on 2011 Census data) and in-lab
       IndiaSAT LULC’s Built-up class, moded over the previous 3 years (2021, 2022,
       2023). The union of these two settlement datasets gives the mask from which
       distance is computed.
    **d. road_water_rasters.ipynb:** This Python notebook is used to generate Distance
       from Roads raster at 100m resolution. The Road Network is taken from the
       PMGSY DRRP II project and is available as GEE assets.
2. **LTP_masks_and_derived_rasters.ipynb:** This Python notebook is used to generate
    the following historical tree cover masks, available as GEE assets:
    a. forested_since_1985: Pixels that have been under tree cover continuously since
1985 to 2023.
    b. forested_since_2000 : Pixels that have been under tree cover continuously since
2000 to 2023.
    c. forested_1985_2000_union: Pixels that were under tree cover at any point in
1985-2000.
    d. forested_2000_onwards_union: Pixels that were under tree cover at any point
in 2000-2023.

3. **restoration_priority.js:** This script is used to generate and save the final Restoration
    Priority Score layers on a given ROI, for deforested and forested areas, masked on the
    type of forest (historically forested, recently forested, intact, degraded etc).

# Canopy Cover Density Estimation

1. Generate binary Canopy Density Classification map (classes: High, Low) over India
    thresholded at the median value
2. Generate binary Canopy Density Classification map (classes: High, Low) over India
    thresholded at a value close to either the 25th or the 75th percentile
       a. **Train Canopy Density Model.ipynb** : This Python notebook was used to train
          the binary classifier given the classification threshold for each ACZ. It generates
          XGBoost models for each ACZ.
       b. **Predict CCD Results.ipynb** : Given the trained models from Step 2(a), this
          notebook was used to predict Canopy Density in 2022. It generates multiple
          CSVs for each district for each ACZ, containing geometry, features and
          prediction.
       c. **uploadAssets.ipynb:** This notebook is used to compile the multiple CSVs
          generated in Step 2(b) into larger chunks for manual uploading to GEE as
          Feature Collections.
       d. Next, manually upload the CSVs to GEE as Feature Collections (collections of
          points).
       e. **fc_to_image.js:** This GEE script converts the Feature Collections into rasters
          containing the CCD predictions. This is the final binary Canopy Density
          Classification map over India.
3. **cd_analysis.ipynb** : This notebook is used to merge the maps generated in Steps 1 and
    2, resolve conflicts based on the model with the higher F1-score, and export the resulting
    3-class Canopy Density Classification map.

# Ecological Clustering

1. Generate underlying variables
a. **rainfall_temperature_elevation_rasters.ipynb:** This notebook is used to
generate all the underlying variables for the coarse SNIC-based clustering step
(Step 2) at 5 km resolution.
i. Annual rainfall and number of wet months (months with rainfall > 100 mm)
averaged from 2003-2023.
ii. Seasonal mean temperature and mean diurnal temperature range
averaged from 2003-2023. Seasons are Rabi, Kharif, Zaid.
iii. Mean elevation based on SRTM-DEM.
It is also used to generate the following terrain-based variables from SRTM-DEM
for the fine K-Means clustering (Step 4) at 30 m resolution.
iv. Elevation
v. Slope
vi. Aspect
b. **road_water_rasters.ipynb:** This notebook is used to generate the Distance to
Water Source raster for the year 2022 at 100 m resolution. It is based on in-lab
IndiaSAT LULC’s Water classes.
2. Do coarse clustering of an ACZ based on rainfall, temperature, coarse elevation (5 km)
    a. Decide how many SNIC superpixels (K) should be in a particular ACZ based on
       the K-Means elbow curve.
       Use **compute_params_kmeans.js** to search the K-Means elbow curve for a
       given feature set and ROI, compute the optimal K based on the point of
       maximum curvature, and save this parameter K in a GEE asset.
    b. Find size of SNIC spacing grid that will yield K superpixels.
       Use **compute_params_snic.js** after running Step 2(a) to compute the size of the
       spacing corresponding to the optimal K and save this parameter S in a GEE
       asset.
    c. Do SNIC segmentation.
       Use **run_experiments.js** after running Steps 2(a) and 2(b) to do the SNIC
       segmentation and visualize/export as needed.
3. Get FAO soil types features from Harmonized World Soil Database v2 and intersect
    these features with the SNIC superpixels generated in Step 2.
4. In each of these intersected features, do K-Means clustering based on fine elevation,
    slope and distance to water source
       a. Use **compute_params_kmeans.js** to get the optimal K based on maximum
          curvature of the elbow curve and save this parameter in a GEE asset.
       b. Use **run_experiments.js** after running Step 4(a) to do the K-Means clustering
          and visualize/export as needed.
5. After generating SNIC and K-Means clusters, use **join_images.js** to mosaic together all
    the ACZ-wise outputs and stack them into a single pan-India multilevel ecological
    clustering asset.
6. After obtaining the final clusters, use **assign_potential.js** to generate and save the CCD
    Potential table containing one row for each K-Means cluster.
7. To add new features (like rainfall, temperature, pH) to the pipeline, modify
    FEATURE_BUILDERS in **feature_prep.js**. FEATURE_BUILDERS is a dictionary
    mapping a feature name to a function that returns an ee.Image.
8. To visualize new features, add a visparams dictionary to VIS_PARAMS in
    **visualization.js**.
9. Helper modules: **kmeans.js** and **snic.js**.

Important Links:
1. [FLR Scripts and Assets](https://docs.google.com/spreadsheets/d/1aMlD0qJ2r7c6sjgI6fYCkzfZsNP7Vm1wMZJzR2B4j4o/edit?gid=0#gid=0)
2. [FLR Report](https://drive.google.com/file/d/1fwekPy-AsNR3OqOznvdP8brVBKoZ4uEX/view?usp=sharing)
3. [India Multilevel Ecological Clusters Asset Description](https://docs.google.com/spreadsheets/u/0/d/1vw-N_uy77h4zjlTm710nrUtVAMN3jcRR7-4Tgyzrj5E/edit)

