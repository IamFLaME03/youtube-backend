import mongoose, { isValidObjectId } from "mongoose"
import { Comment } from "../models/comment.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

const getVideoComments = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { page = 1, limit = 10 } = req.query

    if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid videoId");

    const aggregate = Comment.aggregate([
        { $match: { video: new mongoose.Types.ObjectId(videoId) } },
        { $sort: { createdAt: -1 } },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    { $project: { username: 1, fullName: 1, avatar: 1 } }
                ]
            }
        },
        { $unwind: "$owner" }
    ]);

    const options = {
        page: parseInt(page),
        limit: parseInt(limit)
    };

    const comments = await Comment.aggregatePaginate(aggregate, options);

    return res.status(200).json(new ApiResponse(200, comments, "Comments fetched successfully"));
})

const addComment = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { content } = req.body;

    if (!isValidObjectId(videoId)) throw new ApiError(400, "Invalid videoId");
    if (!content || content.trim() === "") throw new ApiError(400, "Comment content is required");

    const comment = await Comment.create({
        content,
        video: videoId,
        owner: req.user?._id
    });

    return res.status(201).json(new ApiResponse(201, comment, "Comment added successfully"));
})

const updateComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    const { content } = req.body;

    if (!isValidObjectId(commentId)) throw new ApiError(400, "Invalid commentId");
    if (!content || content.trim() === "") throw new ApiError(400, "Comment content is required");

    const comment = await Comment.findOneAndUpdate(
        { _id: commentId, owner: req.user?._id },
        { $set: { content } },
        { new: true }
    );

    if (!comment) throw new ApiError(404, "Comment not found or unauthorized");

    return res.status(200).json(new ApiResponse(200, comment, "Comment updated successfully"));
})

const deleteComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;

    if (!isValidObjectId(commentId)) throw new ApiError(400, "Invalid commentId");

    const comment = await Comment.findOneAndDelete({ _id: commentId, owner: req.user?._id });

    if (!comment) throw new ApiError(404, "Comment not found or unauthorized");

    return res.status(200).json(new ApiResponse(200, {}, "Comment deleted successfully"));
})

export {
    getVideoComments,
    addComment,
    updateComment,
    deleteComment
}
