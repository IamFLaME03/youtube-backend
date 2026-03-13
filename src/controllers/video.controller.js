import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Video } from "../models/video.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";



const getAllVideos = asyncHandler(async (req, res) => {
   const {
      page = 1,
      limit = 10,
      query,
      sortBy = "createdAt",
      sortType = "desc",
      userId
   } = req.query

   const matchStage = {
      isPublished: true
   }

   // search
   if (query) {
      matchStage.$text = {
         $search: query
      }
   }
   // filter by user
   if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) throw new ApiError(404, "user not found")
      matchStage.owner = new mongoose.Types.ObjectId(userId)
   }

   const sortStage = {}
   // ascending = 1, descending = -1
   sortStage[sortBy] = sortType === 'asc' ? 1 : -1;

   // Aggregate pipeline
   const aggregate = Video.aggregate([
      {
         $match: matchStage
      },
      {
         $lookup: {
            from: "users",
            localField: "owner",
            foreignField: "_id",
            as: "owner",
            pipeline: [
               {
                  $project: {
                     fullName: 1,
                     username: 1,
                     avatar: 1
                  }
               }
            ]
         }
      },
      {
         $addFields: {
            owner: { $first: "$owner" }
         }
      },
      {
         $sort: sortStage
      }
   ])

   const options = {
      page: parseInt(page),
      limit: parseInt(limit)
   }

   const videos = await Video.aggregatePaginate(aggregate, options)

   return res
      .status(200)
      .json(
         new ApiResponse(
            200,
            videos,
            "Videos fetched successfully"
         )
      )
})

const publishVideo = asyncHandler(async (req, res) => {
   const { title, description } = req.body

   if ([title, description].some((field) => !field || field?.trim() === "")) {
      throw new ApiError(400, "Title and description are required")
   }
   console.log("title mil gaya");

   const videoLocalFile = req.files?.videoFile[0]?.path;
   const thumbnailLocalFile = req.files?.thumbnail[0]?.path;

   if (!videoLocalFile) {
      throw new ApiError(400, "Video File is required")
   }
   if (!thumbnailLocalFile) {
      throw new ApiError(400, "Thumbnail is required")
   }
   console.log("videoLocalFile fetched");


   const videoFile = await uploadOnCloudinary(videoLocalFile)
   const thumbnail = await uploadOnCloudinary(thumbnailLocalFile)

   console.log("videoFile", videoFile);

   if (!videoFile) throw new ApiError(400, "Video file is required")
   if (!thumbnail) throw new ApiError(400, "Thumbnail file is required")


   console.log("uploading code...");

   const video = await Video.create({
      title,
      description,
      videoFile: videoFile.url,
      thumbnail: thumbnail.url,
      owner: new mongoose.Types.ObjectId(req.user?._id),
      duration: Number(videoFile.duration.toFixed(1))
   })

   if (!video) throw new ApiError(500, "Something went wrong while posting video")

   return res
      .status(200)
      .json(
         new ApiResponse(
            200,
            video,
            "video posted successfully"
         )
      )
})

const getVideoById = asyncHandler(async (req, res) => {
   const { videoId } = req.params

   if (!videoId) throw new ApiError(400, "videoId is required")

   const video = await Video.aggregate([
      {
         $match: {
            _id: new mongoose.Types.ObjectId(videoId)
         }
      },
      {
         $lookup: {
            from: "users",
            localField: "owner",
            foreignField: "_id",
            as: "owner",
            pipeline: [
               {
                  $lookup: {
                     from: "subscriptions",
                     localField: "_id",
                     foreignField: "channel",
                     as: "subscribers"
                  }
               },
               {
                  $addFields: {
                     subscriberCount: { $size: "$subscribers" },
                  }
               },
               {
                  $project: {
                     fullName: 1,
                     usernmae: 1,
                     avatar: 1,
                     subscriberCount: 1,
                     isSubscribed: 1
                  }
               }
            ]
         }
      },
      {
         $addFields: {
            owner: {
               $first: "$owner"
            },
            isSubscribed: {
               $cond: {
                  if: { $in: [new mongoose.Types.ObjectId(req.user?._id), "$owner.subscribers.subscriber"] },
                  then: true,
                  else: false
               }
            }
         }
      }
   ])

   if (!video?.length) throw new ApiError(404, "Video does not exists")

   return res
      .status(200)
      .json(
         new ApiResponse(
            200,
            video[0],
            "video fetched successfully"
         )
      )

})


const updateVideo = asyncHandler(async (req, res) => {
   const { videoId } = req.params;
   const { title, description } = req.body;
   const thumbnailLocalFile = req.file?.path;

   if (!mongoose.Types.ObjectId.isValid(videoId)) {
      throw new ApiError(400, "Invalid videoId");
   }

   if (!title && !description && !thumbnailLocalFile) {
      throw new ApiError(400, "Provide at least one field to update");
   }

   const video = await Video.findOne({ _id: videoId, owner: req.user?._id });
   if (!video) throw new ApiError(404, "Video not found or unauthorized");

   if (title) video.title = title;
   if (description) video.description = description;

   if (thumbnailLocalFile) {
      const thumbnail = await uploadOnCloudinary(thumbnailLocalFile);
      if (!thumbnail) throw new ApiError(500, "Error uploading thumbnail");
      video.thumbnail = thumbnail.url;
   }

   await video.save({ validateBeforeSave: false });

   return res.status(200).json(new ApiResponse(200, video, "Video updated successfully"));
})

const deleteVideo = asyncHandler(async (req, res) => {
   const { videoId } = req.params
   if (!mongoose.Types.ObjectId.isValid(videoId)) {
      throw new ApiError(400, "Invalid videoId");
   }

   const video = await Video.findOneAndDelete({ _id: videoId, owner: req.user?._id });

   if (!video) throw new ApiError(404, "Video not found or unauthorized");

   return res.status(200).json(new ApiResponse(200, {}, "Video deleted successfully"));
})

const togglePublishStatus = asyncHandler(async (req, res) => {
   const { videoId } = req.params
   if (!mongoose.Types.ObjectId.isValid(videoId)) {
      throw new ApiError(400, "Invalid videoId");
   }

   const video = await Video.findOne({ _id: videoId, owner: req.user?._id });

   if (!video) throw new ApiError(404, "Video not found or unauthorized");

   video.isPublished = !video.isPublished;
   await video.save({ validateBeforeSave: false });

   return res.status(200).json(new ApiResponse(200, video, "Publish status toggled successfully"));
})

export {
   getAllVideos,
   publishVideo,
   getVideoById,
   deleteVideo,
   updateVideo,
   togglePublishStatus
}