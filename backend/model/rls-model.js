const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
//const { nanoid } = require('nanoid');

const Schema = mongoose.Schema;
const rlsSchema = new Schema({
    rule_id: {
      type: String,
      required: true,
      default: () => randomUUID(),
      index: { unique: true },
    },
    rule_name: {
      type: String,
      required: true
    },
    dash_id: {
      type: String,
      required: true
    },
    dash_name: {
      type: String,
      required: true
    },
    dataset: {
      type: String,
      required: true
    },
    kolom: {
      type: String,
      required: true
    },
    operator: {
      type: String,
      required: true
    },
    clause: {
      type: Object,
      required: false
    }
  });

  var rls= mongoose.model('rls',rlsSchema);
  module.exports = rls;