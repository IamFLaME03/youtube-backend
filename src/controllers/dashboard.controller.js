import mongoose from "mongoose"
import {Video} from "../models/video.model.js"
import {Subscription} from "../models/subscription.model.js"
import {Like} from "../models/like.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const getChannelStats = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    const totalVideos = await Video.countDocuments({ owner: userId });
    
    const viewsStats = await Video.aggregate([
        { $match: { owner: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, totalViews: { $sum: "$views" } } }
    ]);
    const totalViews = viewsStats.length > 0 ? viewsStats[0].totalViews : 0;

    const totalSubscribers = await Subscription.countDocuments({ channel: userId });

    const videoLikesStats = await Video.aggregate([
        { $match: { owner: new mongoose.Types.ObjectId(userId) } },
        { $lookup: { from: "likes", localField: "_id", foreignField: "video", as: "likes" } },
        { $project: { likesCount: { $size: "$likes" } } },
        { $group: { _id: null, totalLikes: { $sum: "$likesCount" } } }
    ]);
    const totalLikes = videoLikesStats.length > 0 ? videoLikesStats[0].totalLikes : 0;

    const stats = {
        totalVideos,
        totalViews,
        totalSubscribers,
        totalLikes
    };

    return res.status(200).json(new ApiResponse(200, stats, "Channel stats fetched successfully"));
})

const getChannelVideos = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    const videos = await Video.find({ owner: userId }).sort({ createdAt: -1 });

    return res.status(200).json(new ApiResponse(200, videos, "Channel videos fetched successfully"));
})

export {
    getChannelStats, 
    getChannelVideos
}