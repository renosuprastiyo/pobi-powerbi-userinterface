const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const customSchema = new Schema({
    user_name: {
        type: String,
        required: true
    },
    dashboard:{
        type: Object,
        required: false
    }
});

var custom = mongoose.model('custom',customSchema);
module.exports = custom;