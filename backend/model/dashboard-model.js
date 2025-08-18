const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const dashboardSchema = new Schema({
    dash_id: {
      type: String,
      required: false
    },
    dash_name: {
      type: String,
      required: false
    }
});

var dashboard = mongoose.model('dashboard',dashboardSchema);
module.exports = dashboard;