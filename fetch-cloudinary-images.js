#!/usr/bin/env node

/**
 * Cloudinary Image Fetcher
 *
 * This script fetches all images from your Cloudinary account organized by folders
 * and generates an images.json file for your static website.
 *
 * Setup:
 * 1. Run: npm install cloudinary
 * 2. Set your credentials below or use environment variables
 * 3. Run: node fetch-cloudinary-images.js
 * 4. Commit the generated images.json file
 * 5. Re-run this script whenever you add new photos
 */

const cloudinary = require('cloudinary').v2;
const fs = require('fs');

// Configuration - Uses environment variables (required for GitHub Actions)
const config = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'ddnebrkpu',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
};

cloudinary.config(config);

// Custom album covers configuration
// Add your preferred cover image index for each album (0 = first image, 1 = second, etc.)
// Leave empty to use the first image by default
const albumCovers = {
  '2020, SOL November': 1,
  '2021, SOL April': 5,
  '2021, SOL November': 2,
  '2022, SOL April': 2,
  '2022, SOL November': 0,
  '2023, SOL April': 1,
  '2023, SOL October': 4,
  '2024, SOL April': 6,
  '2024, SOL October': 1,
  '2025, SOL April': 11,
  '2025, SOL November': 35
};

// Convert Cloudinary URLs to browser-compatible formats
function convertToBrowserFormat(url) {
  // Cloudinary URLs have format: https://res.cloudinary.com/cloud/image/upload/...
  // We'll add format transformation to convert HEIC/HEIF to JPG automatically

  if (!url.includes('/image/upload/')) {
    return url;
  }

  // Insert f_auto,q_auto transformation after /upload/
  // f_auto = automatic format (converts HEIC to JPG/PNG)
  // q_auto = automatic quality optimization
  return url.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
}

async function fetchAllImages() {
  console.log('Fetching folders and images from Cloudinary...');

  try {
    // First, get all root folders
    const foldersResult = await cloudinary.api.root_folders();
    const folders = foldersResult.folders || [];

    console.log(`Found ${folders.length} folders`);

    const albumsByFolder = {};
    const allImages = [];

    // Fetch images from each folder
    for (const folder of folders) {
      console.log(`Fetching images from folder: ${folder.name}...`);

      let folderImages = [];
      let nextCursor = null;

      do {
        const result = await cloudinary.search
          .expression(`asset_folder="${folder.name}"`)
          .sort_by('created_at', 'desc')
          .max_results(500)
          .next_cursor(nextCursor)
          .execute();

        const resources = result.resources || [];
        // Convert URLs to browser-compatible formats (handles HEIC/HEIF)
        const convertedUrls = resources.map(r => convertToBrowserFormat(r.secure_url));
        folderImages.push(...convertedUrls);
        allImages.push(...convertedUrls);
        nextCursor = result.next_cursor;
      } while (nextCursor);

      if (folderImages.length > 0) {
        albumsByFolder[folder.name] = folderImages;
        console.log(`  - Found ${folderImages.length} images in ${folder.name}`);
      }
    }

    // Also check for root-level images (not in any folder)
    console.log('Checking for root-level images...');
    const rootImages = [];
    let nextCursor = null;

    do {
      const result = await cloudinary.search
        .expression('asset_folder=""')
        .sort_by('created_at', 'desc')
        .max_results(500)
        .next_cursor(nextCursor)
        .execute();

      const resources = result.resources || [];
      const convertedUrls = resources.map(r => convertToBrowserFormat(r.secure_url));
      rootImages.push(...convertedUrls);
      allImages.push(...convertedUrls);
      nextCursor = result.next_cursor;
    } while (nextCursor);

    console.log(`\nTotal images found: ${allImages.length}`);
    console.log(`Images in folders: ${allImages.length - rootImages.length}`);
    console.log(`Images at root: ${rootImages.length}`);

    // Format for the website
    const albums = Object.entries(albumsByFolder).map(([folderName, images]) => {
      // Get custom cover index or default to 0 (first image)
      const coverIndex = albumCovers[folderName] || 0;
      const coverImage = images[coverIndex] || images[0];

      return {
        title: formatFolderName(folderName),
        folder: folderName,
        coverImage: coverImage,
        images: images
      };
    });

    // Sort albums by title (reverse chronological - most recent first)
    albums.sort((a, b) => b.title.localeCompare(a.title));

    // Collect all images for carousel (all images including root and folders)
    const carouselImages = allImages;

    const output = {
      cloudName: config.cloud_name,
      lastUpdated: new Date().toISOString(),
      totalImages: allImages.length,
      carouselImages: carouselImages,
      albums: albums
    };

    // Write to JSON file
    fs.writeFileSync('images.json', JSON.stringify(output, null, 2));

    console.log('\n✓ Successfully generated images.json');
    console.log(`✓ Found ${albums.length} albums`);
    console.log(`✓ Total ${carouselImages.length} images for carousel\n`);

    // Display album summary
    if (albums.length > 0) {
      console.log('Albums:');
      albums.forEach(album => {
        console.log(`  - ${album.title}: ${album.images.length} photos`);
      });
    }

    if (rootImages.length > 0) {
      console.log(`\nNote: ${rootImages.length} images found at root level (not in folders)`);
    }

  } catch (error) {
    console.error('\n❌ Error fetching images:', error);

    if (error && error.message && error.message.includes('api_key')) {
      console.error('\nPlease set your Cloudinary credentials:');
      console.error('1. Edit fetch-cloudinary-images.js and add your API key and secret');
      console.error('2. Or set environment variables:');
      console.error('   export CLOUDINARY_API_KEY="your-key"');
      console.error('   export CLOUDINARY_API_SECRET="your-secret"');
    }

    process.exit(1);
  }
}

// Format folder name to display title
function formatFolderName(folderName) {
  return folderName
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Run the script
fetchAllImages();
