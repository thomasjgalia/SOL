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

// Check if HEIC file is actually a live photo/video
function isHEICVideo(resource) {
  // HEIC live photos have video codec information
  return resource.format === 'heic' && 
         resource.resource_type === 'video';
}

// Convert Cloudinary URLs to browser-compatible formats
function convertToBrowserFormat(resource) {
  const url = resource.secure_url;
  const resourceType = resource.resource_type;
  const format = resource.format;

  // For HEIC live photos (videos), keep them as videos
  if (isHEICVideo(resource)) {
    return {
      url: url,
      originalUrl: url,
      isVideo: true,
      isHEICLivePhoto: true
    };
  }

  // For regular videos (MOV, MP4, etc), use video thumbnail
  if (resourceType === 'video') {
    return {
      url: url.replace('/video/upload/', '/video/upload/so_0,f_jpg,q_auto/'),
      originalUrl: url,
      isVideo: true
    };
  }

  // For static HEIC/HEIF images, convert to browser-compatible format
  if (format === 'heic' || format === 'heif') {
    return {
      url: url.replace('/image/upload/', '/image/upload/f_auto,q_auto/'),
      originalUrl: url,
      isVideo: false
    };
  }

  // For regular images, add format transformation
  if (url.includes('/image/upload/')) {
    return {
      url: url.replace('/image/upload/', '/image/upload/f_auto,q_auto/'),
      originalUrl: url,
      isVideo: false
    };
  }

  return {
    url: url,
    originalUrl: url,
    isVideo: false
  };
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
          .with_field('context')
          .with_field('metadata')
          .next_cursor(nextCursor)
          .execute();

        const resources = result.resources || [];
        const convertedItems = resources.map(r => convertToBrowserFormat(r));
        folderImages.push(...convertedItems);
        allImages.push(...convertedItems);
        nextCursor = result.next_cursor;
      } while (nextCursor);

      if (folderImages.length > 0) {
        albumsByFolder[folder.name] = folderImages;
        console.log(`  - Found ${folderImages.length} items in ${folder.name}`);
      }
    }

    // Also check for root-level images
    console.log('Checking for root-level images...');
    const rootImages = [];
    let nextCursor = null;

    do {
      const result = await cloudinary.search
        .expression('asset_folder=""')
        .sort_by('created_at', 'desc')
        .max_results(500)
        .with_field('context')
        .with_field('metadata')
        .next_cursor(nextCursor)
        .execute();

      const resources = result.resources || [];
      const convertedItems = resources.map(r => convertToBrowserFormat(r));
      rootImages.push(...convertedItems);
      allImages.push(...convertedItems);
      nextCursor = result.next_cursor;
    } while (nextCursor);

    console.log(`\nTotal items found: ${allImages.length}`);
    console.log(`Items in folders: ${allImages.length - rootImages.length}`);
    console.log(`Items at root: ${rootImages.length}`);

    // Format for the website
    const albums = Object.entries(albumsByFolder).map(([folderName, images]) => {
      const coverIndex = albumCovers[folderName] || 0;
      const coverImage = images[coverIndex] || images[0];

      return {
        title: formatFolderName(folderName),
        folder: folderName,
        coverImage: coverImage,
        images: images
      };
    });

    // Sort albums by title (reverse chronological)
    albums.sort((a, b) => b.title.localeCompare(a.title));

    const output = {
      cloudName: config.cloud_name,
      lastUpdated: new Date().toISOString(),
      totalImages: allImages.length,
      carouselImages: allImages,
      albums: albums
    };

    // Write to JSON file
    fs.writeFileSync('images.json', JSON.stringify(output, null, 2));

    console.log('\n✓ Successfully generated images.json');
    console.log(`✓ Found ${albums.length} albums`);
    console.log(`✓ Total ${allImages.length} items for carousel\n`);

    // Display album summary
    if (albums.length > 0) {
      console.log('Albums:');
      albums.forEach(album => {
        const videoCount = album.images.filter(i => i.isVideo).length;
        const photoCount = album.images.length - videoCount;
        console.log(`  - ${album.title}: ${photoCount} photos, ${videoCount} videos`);
      });
    }

    if (rootImages.length > 0) {
      console.log(`\nNote: ${rootImages.length} items found at root level (not in folders)`);
    }

  } catch (error) {
    console.error('\n✖ Error fetching images:', error);

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

function formatFolderName(folderName) {
  return folderName
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Run the script
fetchAllImages();