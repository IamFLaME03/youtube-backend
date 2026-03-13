import mongoose, { isValidObjectId } from "mongoose"
import { Like } from "../models/like.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

const toggleVideoLike = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid videoId");

    const like = await Like.findOne({ video: videoId, likedBy: req.user?._id });

    if (like) {
        await Like.findByIdAndDelete(like._id);
        return res.status(200).json(new ApiResponse(200, { isLiked: false }, "Removed like"));
    } else {
        await Like.create({ video: videoId, likedBy: req.user?._id });
        return res.status(200).json(new ApiResponse(200, { isLiked: true }, "Added like"));
    }
})

const toggleCommentLike = asyncHandler(async (req, res) => {
    const { commentId } = req.params
    if (!isValidObjectId(commentId)) throw new ApiError(400, "Invalid commentId");

    const like = await Like.findOne({ comment: commentId, likedBy: req.user?._id });

    if (like) {
        await Like.findByIdAndDelete(like._id);
        return res.status(200).json(new ApiResponse(200, { isLiked: false }, "Removed like"));
    } else {
        await Like.create({ comment: commentId, likedBy: req.user?._id });
        return res.status(200).json(new ApiResponse(200, { isLiked: true }, "Added like"));
    }
})

const toggleTweetLike = asyncHandler(async (req, res) => {
    const { tweetId } = req.params
    if (!isValidObjectId(tweetId)) throw new ApiError(400, "Invalid tweetId");

    const like = await Like.findOne({ tweet: tweetId, likedBy: req.user?._id });

    if (like) {
        await Like.findByIdAndDelete(like._id);
        return res.status(200).json(new ApiResponse(200, { isLiked: false }, "Removed like"));
    } else {
        await Like.create({ tweet: tweetId, likedBy: req.user?._id });
        return res.status(200).json(new ApiResponse(200, { isLiked: true }, "Added like"));
    }
})

const getLikedVideos = asyncHandler(async (req, res) => {
    const likes = await Like.aggregate([
        {
            $match: {
                likedBy: new mongoose.Types.ObjectId(req.user?._id),
                video: { $exists: true }
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "video",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner"
                        }
                    },
                    {
                        $unwind: "$owner"
                    }
                ]
            }
        },
        {
            $unwind: "$video"
        },
        {
            $sort: { createdAt: -1 }
        },
        {
            $project: {
                video: 1
            }
        }
    ]);

    return res.status(200).json(new ApiResponse(200, likes.map(l => l.video), "Liked videos fetched successfully"));
})

export {
    toggleCommentLike,
    toggleTweetLike,
    toggleVideoLike,
    getLikedVideos
}