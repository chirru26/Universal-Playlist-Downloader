import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const trackSchema = new Schema(
  {
    providerTrackId: { type: String, trim: true, maxlength: 300 },
    title: { type: String, trim: true, maxlength: 500, required: true },
    artist: { type: String, trim: true, maxlength: 300 },
    durationSeconds: { type: Number, min: 0, max: 86400 },
    artworkUrl: { type: String, trim: true, maxlength: 2048 },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "skipped"],
      default: "pending",
      required: true,
    },
    errorCode: { type: String, trim: true, maxlength: 80 },
  },
  { _id: true, timestamps: true },
);

const downloadJobSchema = new Schema(
  {
    ownerTokenHash: { type: String, required: true, select: false, index: true },
    sourceUrl: { type: String, required: true, maxlength: 2048 },
    provider: {
      type: String,
      enum: ["youtube", "spotify", "soundcloud", "direct", "unknown"],
      default: "unknown",
      required: true,
    },
    qualityKbps: {
      type: Number,
      enum: [64, 96, 128, 192, 256, 320],
      required: true,
    },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "cancelled"],
      default: "queued",
      required: true,
      index: true,
    },
    tracks: { type: [trackSchema], default: [] },
    progressPercent: { type: Number, min: 0, max: 100, default: 0 },\n    attempts: { type: Number, min: 0, max: 3, default: 0 },\n    leaseTokenHash: { type: String, select: false },\n    leaseExpiresAt: { type: Date, default: undefined, index: true },
    archiveKey: { type: String, maxlength: 500, select: false },
    errorCode: { type: String, trim: true, maxlength: 80 },
    expiresAt: { type: Date, default: undefined },
  },
  { timestamps: true, minimize: false },
);

// Only jobs explicitly assigned an expiry time are removed by MongoDB.
// This index does not clean up files in local or object storage.
downloadJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });
downloadJobSchema.index({ status: 1, createdAt: 1 });

export type DownloadJobDocument = InferSchemaType<typeof downloadJobSchema>;

const DownloadJob: Model<DownloadJobDocument> =
  (mongoose.models.DownloadJob as Model<DownloadJobDocument> | undefined) ??
  mongoose.model<DownloadJobDocument>("DownloadJob", downloadJobSchema);

export default DownloadJob;
