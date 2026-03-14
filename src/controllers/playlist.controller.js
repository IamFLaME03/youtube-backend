import mongoose, {isValidObjectId} from "mongoose"
import {Playlist} from "../models/playlist.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"


const createPlaylist = asyncHandler(async (req, res) => {
    const {name, description} = req.body;

    if (!name || name.trim() === "") {
        throw new ApiError(400, "Playlist name is required");
    }

    const playlist = await Playlist.create({
        name,
        description: description || "",
        owner: req.user?._id,
        videos: []
    });

    if (!playlist) throw new ApiError(500, "Error creating playlist");

    return res.status(201).json(new ApiResponse(201, playlist, "Playlist created successfully"));
})

const getUserPlaylists = asyncHandler(async (req, res) => {
    const {userId} = req.params;

    if (!isValidObjectId(userId)) throw new ApiError(400, "Invalid userId");

    const playlists = await Playlist.find({ owner: userId });

    return res.status(200).json(new ApiResponse(200, playlists, "User playlists fetched successfully"));
})

const getPlaylistById = asyncHandler(async (req, res) => {
    const {playlistId} = req.params;

    if (!isValidObjectId(playlistId)) throw new ApiError(400, "Invalid playlistId");

    const playlist = await Playlist.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(playlistId) } },
        { 
            $lookup: {
                from: "videos",
                localField: "videos",
                foreignField: "_id",
                as: "videos"
            }
        },
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

    if (!playlist?.length) throw new ApiError(404, "Playlist not found");

    return res.status(200).json(new ApiResponse(200, playlist[0], "Playlist fetched successfully"));
})

const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const {playlistId, videoId} = req.params;

    if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid playlistId or videoId");
    }

    const playlist = await Playlist.findOneAndUpdate(
        { _id: playlistId, owner: req.user?._id },
        { $addToSet: { videos: videoId } }, // Add video to array only if it doesn't exist
        { new: true }
    );

    if (!playlist) throw new ApiError(404, "Playlist not found or unauthorized");

    return res.status(200).json(new ApiResponse(200, playlist, "Video added to playlist"));
})

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const {playlistId, videoId} = req.params;

    if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid playlistId or videoId");
    }

    const playlist = await Playlist.findOneAndUpdate(
        { _id: playlistId, owner: req.user?._id },
        { $pull: { videos: videoId } }, // Remove video from array
        { new: true }
    );

    if (!playlist) throw new ApiError(404, "Playlist not found or unauthorized");

    return res.status(200).json(new ApiResponse(200, playlist, "Video removed from playlist"));
})

const deletePlaylist = asyncHandler(async (req, res) => {
    const {playlistId} = req.params;

    if (!isValidObjectId(playlistId)) throw new ApiError(400, "Invalid playlistId");

    const playlist = await Playlist.findOneAndDelete({ _id: playlistId, owner: req.user?._id });

    if (!playlist) throw new ApiError(404, "Playlist not found or unauthorized");

    return res.status(200).json(new ApiResponse(200, {}, "Playlist deleted successfully"));
})

const updatePlaylist = asyncHandler(async (req, res) => {
    const {playlistId} = req.params;
    const {name, description} = req.body;

    if (!isValidObjectId(playlistId)) throw new ApiError(400, "Invalid playlistId");
    if (!name && !description) throw new ApiError(400, "Provide name or description to update");

    const playlist = await Playlist.findOne({ _id: playlistId, owner: req.user?._id });

    if (!playlist) throw new ApiError(404, "Playlist not found or unauthorized");

    if (name) playlist.name = name;
    if (description) playlist.description = description;

    await playlist.save();

    return res.status(200).json(new ApiResponse(200, playlist, "Playlist updated successfully"));
})

export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist
}
