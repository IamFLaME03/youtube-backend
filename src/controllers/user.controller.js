import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"

const generateAccessAndRefreshTokens = async (userId) => {
   try {
      const user = await User.findById(userId)

      const accessToken = user.generateAccessToken()
      const refreshToken = user.generateRefreshToken()

      user.refreshToken = refreshToken
      await user.save({ validateBeforeSave: false })

      return { accessToken, refreshToken }

   } catch (error) {
      throw new ApiError(500, "Something went wrong while generating refresh and access token.")
   }
}

const registerUser = asyncHandler(async (req, res) => {
   // get user details from frontend
   // validation - not empty
   // check if user already exists: username, email
   // check for images, check for avatar
   // upload them to cloudinary, avatar
   // create user object - create entry in do
   // remove password and refresh token field from response
   // check for user creation
   // return res

   const { fullName, username, email, password } = req.body

   // check if any field is empty
   if (
      [fullName, email, username, password].some((field) => field?.trim() === "")
   ) {
      throw new ApiError(400, "All fields are required")
   }

   const existedUser = await User.findOne({
      $or: [{ username }, { email }]
   })

   if (existedUser) {
      throw new ApiError(409, "User with email or username already exists")
   }

   const avatarLocalPath = req.files?.avatar[0]?.path;
   // const coverImageLocalPath  = req.files?.coverImage[0]?.path;

   let coverImageLocalPath;
   if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
      coverImageLocalPath = req.files.coverImage[0].path
   }

   if (!avatarLocalPath) {
      throw new ApiError(400, "Avatar file is required")
   }

   const avatar = await uploadOnCloudinary(avatarLocalPath)
   const coverImage = await uploadOnCloudinary(coverImageLocalPath)

   if (!avatar) {
      throw new ApiError(400, "Avatar file is required")
   }

   const user = await User.create({
      fullName,
      avatar: avatar.url,
      coverImage: coverImage?.url || "",
      email,
      password,
      username: username.toLowerCase()
   })

   const createdUser = await User.findById(user._id).select(
      "-password -refreshToken"
   )
   if (!createdUser) {
      throw new ApiError(500, "Something went wrong while registering User")
   }

   return res.status(201).json(
      new ApiResponse(200, createdUser, "User registerd Successfully")
   )

})

const loginUser = asyncHandler(async (req, res) => {
   const { email, username, password } = req.body

   if (!username && !email) throw new ApiError(400, "username or password is required")

   const user = await User.findOne({
      $or: [{ email }, { username }]
   })
   if (!user) throw new ApiError(404, "User does not exist")

   const isPasswordValid = await user.isPasswordCorrect(password)
   if (!isPasswordValid) throw new ApiError(401, "Invalid user credentials")

   const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)

   const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

   const options = {
      httpOnly: true,
      secure: true
   }

   return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
         new ApiResponse(
            200,
            {
               user: loggedInUser,
               accessToken,
               refreshToken
            },
            "User logged in Successfully"
         )
      )
})

const logoutUser = asyncHandler(async (req, res) => {
   await User.findByIdAndUpdate(
      req.user._id,
      {
         $unset: {
            refreshToken: 1 // this removes the field from the document
         }
      },
      {
         new: true,
      }
   )

   const options = {
      httpOnly: true,
      secure: true
   }

   return res
      .status(200)
      .clearCookie("accessToken")
      .clearCookie("refreshToken")
      .json(
         new ApiResponse(200, {}, "User Logged Out")
      )
})

const refreshAccessToken = asyncHandler(async (req, res) => {
   const incomingRefreshToken = req.cookies?.refreshToken || req.body.refreshToken

   if (!incomingRefreshToken) {
      throw new ApiError(401, "Unauthorised Request")
   }

   try {
      const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
      const user = await User.findById(decodedToken?._id)
      if (!user) throw new ApiError(401, "Invalid refresh token")

      if (incomingRefreshToken !== user?.refreshToken) {
         throw new ApiError(401, "Refresh token is expired or used")
      }

      const options = {
         httpOnly: true,
         secure: true
      }
      const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)

      return res
         .status(200)
         .cookie("accessToken", accessToken, options)
         .cookie("refreshToken", refreshToken, options)
         .json(
            new ApiResponse(
               200,
               { accessToken, refreshToken: refreshToken },
               "Access token refreshed"
            )
         )
   } catch (error) {
      throw new ApiError(401, error?.message || "Invalid refresh token")
   }

})

const changeCurrentPassword = asyncHandler(async (req, res) => {
   const { oldPassword, newPassword } = req.body

   const user = await User.findById(req.user?._id)

   const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
   if (!isPasswordCorrect) {
      throw new ApiError(400, "Invalid Old Password")
   }

   user.password = newPassword
   await user.save({ validateBeforeSave: false })
   return res
      .status(200)
      .json(new ApiResponse(200, {}, "Password Changed Successfully"))
})

const getCurrentUser = asyncHandler(async (req, res) => {
   return res
      .status(200)
      .json(new ApiResponse(200, req.user, "Current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async (req, res) => {
   const { fullName, email, } = req.body

   if (!fullName || !email) throw new ApiError(400, "All fields are required")

   const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
         $set: {
            fullName,
            email: email
         }
      },
      { new: true }
   ).select("-password")

   return res
      .status(200)
      .json(new ApiResponse(200, user, "Account details updated successfully"))
})

const updateUserAvatar = asyncHandler(async (req, res) => {
   const avatarLocalPath = req.file?.path
   if (!avatarLocalPath) {
      throw new ApiError(400, "Avatar file is missing")
   }

   const user = await User.findById(req.user?._id)
   const deleteResult = await deleteFromCloudinary(user.avatar);
   console.log("avatar deleted? :", deleteResult);

   if (!deleteResult || deleteResult.result !== "ok") {
      throw new Error("Failed to delete old avatar from Cloudinary");
   }

   const avatar = await uploadOnCloudinary(avatarLocalPath)
   if (!avatar.url) {
      throw new ApiError(400, "Error while uploading on avatar")
   }

   const updatedUser = await User.findByIdAndUpdate(
      req.user?.id,
      {
         $set: {
            avatar: avatar.url
         }
      },
      {
         returnDocument: "after"
      }
   ).select("-password");

   return res
      .status(200)
      .json(new ApiResponse(200, updatedUser, "Avatar Image updated successfully"))
})

const updateCoverImage = asyncHandler(async (req, res) => {
   const coverImageLocalPath = req.file?.path
   if (!coverImageLocalPath) throw new ApiError(400, "Cover Image file is missing")

   const user = await User.findById(req.user?._id)
   const deleteResult = await deleteFromCloudinary(user.coverImage);
   console.log("avatar deleted? :", deleteResult);

   if (!deleteResult || deleteResult.result !== "ok") {
      throw new Error("Failed to delete old avatar from Cloudinary");
   }

   const coverImage = await uploadOnCloudinary(coverImageLocalPath)
   if (!coverImage.url) throw new ApiError(400, "Error while uploading on cover image")

   const updatedUser = await User.findByIdAndUpdate(
      req.user?.id,
      {
         $set: {
            coverImage: coverImage.url
         }
      },
      { new: true }
   ).select("-password")

   return res
      .status(200)
      .json(new ApiResponse(200, updatedUser, "Cover Image updated successfully"))
})

const getUserChannelProfile = asyncHandler(async (req, res) => {
   const { username } = req.params

   if (!username?.trim()) {
      throw new ApiError(400, "username is missing")
   }

   const channel = await User.aggregate([
      //stage 1: finds single document from username
      {
         $match: {
            username: username?.toLowerCase()
         }
      },
      //stage 2: find subscribers
      {
         $lookup: {
            from: "subscriptions",
            localField: "_id",
            foreignField: "channel",
            as: "subscribers"
         }
      },
      //stage 3: find channel/user to this user subscribing
      {
         $lookup: {
            from: "subscriptions",
            localField: "_id",
            foreignField: "subscriber ",
            as: "subscribedTo"
         }
      },
      //stage 4 : Add New fields
      {
         $addFields: {
            subscribersCount: {
               $size: "$subscribers"
            },
            channelsSubscribedToCount: {
               $size: "$subscribedTo"
            },
            isSubscribed: {
               $cond: {
                  if: {
                     $in: [res.user?._id, "$subscribers.subscriber"]
                  },
                  then: true,
                  else: false
               }
            }
         }
      },
      //stage 5: Send only those value which we want to send
      //use $project to give projection
      {
         $project: {
            fullName: 1,
            username: 1,
            subscribersCount: 1,
            channelsSubscribedToCount: 1,
            isSubscribed: 1,
            avatar: 1,
            coverImage: 1,
            email: 1
         }
      }
   ])

   if (!channel?.length) {
      throw new ApiError(404, "Channel does not exists")
   }

   return res
      .status(200)
      .json(new ApiResponse(200, channel[0], "User Channel fetched successfully"))
})

const getWatchHistory = asyncHandler(async (req, res) => {
   const user = await User.aggregate([
      {
         $match: {
            _id: new mongoose.Types.ObjectId(req.user._id)
         }
      },
      {
         $lookup: {
            from: "videos",
            localField: "watchHistory",
            foreignField: "_id",
            as: "watchHistory",
            pipeline: [
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
                              avatar: 1,
                           }
                        }
                     ]
                  },
               },
               {
                  $addFields: {
                     owner: {
                        $first: "$owner"
                     }
                  }
               }
            ]
         }
      }
   ])

   return res
      .status(200)
      .json(
         new ApiResponse(
            200,
            user[0].watchHistory,
            "watch histroy fetched successfully"
         )
      )
})


export {
   registerUser,
   loginUser,
   logoutUser,
   refreshAccessToken,
   changeCurrentPassword,
   getCurrentUser,
   updateAccountDetails,
   updateUserAvatar,
   updateCoverImage,
   getUserChannelProfile,
   getWatchHistory
}