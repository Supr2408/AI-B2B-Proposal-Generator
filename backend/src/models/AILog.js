const mongoose = require("mongoose");

const AILogSchema = new mongoose.Schema(
  {
    system_prompt: {
      type: String,
      required: true,
    },
    user_prompt: {
      type: String,
      required: true,
    },
    raw_response: {
      type: String,
      required: true,
    },
    module: {
      type: String,
      required: true,
    },
    module_version: {
      type: String,
      required: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

module.exports = mongoose.model("AILog", AILogSchema);
