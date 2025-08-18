const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const rlsGroupSchema = new Schema({
    rule_id: {
      type:String,
      required: false
    },
    rule_name: {
      type: String,
      required: true
    },
    dataset: {
      type: String,
      required: true
    },
    group: {
      type: String,
      required: false
    }
  });

var rls_group = mongoose.model('rls_group',rlsGroupSchema);
module.exports = rls_group;