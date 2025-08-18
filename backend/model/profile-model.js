const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const profileSchema = new Schema({
    profile_name: {
      type: String,
      required: true
    },
    is_admin:{
      type: Boolean,
      required: true
    },
    dashboard:{
      type: Object,
      required: false
    }
  });

  var profile = mongoose.model('profile',profileSchema);
  module.exports = profile;