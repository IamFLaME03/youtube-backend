import { v2 as cloudinary } from "cloudinary"
import fs from "fs"

// configuration
cloudinary.config({
   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
   api_key: process.env.CLOUDINARY_API_KEY,
   api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath) => {
   try {
      if (!localFilePath) return null
      
      // upload the file on cloundinary
      const response = await cloudinary.uploader.upload(
         localFilePath, 
         {
            resource_type: "auto",
         }
      )
      
      //file has been uploaded successfully
      fs.unlinkSync(localFilePath)
      
      return response;
   } catch (error) {
      fs.unlinkSync(localFilePath) // remove the locally saved temporary file as the upload operation got failed
      return null;
   }
}

const deleteFromCloudinary = async (imageUrl) => {
   try {

      if (!imageUrl) return null;

      // Extract public_id from URL
      const urlParts = imageUrl.split("/");
      const fileName = urlParts[urlParts.length - 1];
      const publicId = fileName.split(".")[0];

      const result = await cloudinary.uploader.destroy(publicId);

      return result;

   } catch (error) {
      console.error("Cloudinary delete error:", error);
      return null;
   }
};

export {uploadOnCloudinary, deleteFromCloudinary}