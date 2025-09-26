require("dotenv").config();
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const http = require('http');
const parseUrl = require('body-parser');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');

const ssha = require('ssha');
const ldap = require('ldapjs');
const cors = require('cors');
const multer  = require('multer')();

const dashboard = require("./model/dashboard-model");
const profile = require("./model/profile-model");
const custom = require("./model/custom-model");
const rls = require("./model/rls-model");
const rls_group = require("./model/rls_group-model");

const { authenticate } = require('ldap-authentication');
const { randomUUID } = require('crypto');

let encodeUrl = parseUrl.urlencoded({ extended: true });

const app = express();

app.use(parseUrl.json());

app.use('/js', express.static('./node_modules/bootstrap/dist/js/'));
app.use('/css', express.static('./node_modules/bootstrap/dist/css/'));
app.use('/js', express.static('./node_modules/powerbi-client/dist/'));
app.use('/img', express.static('./assets/img'));

const corsOptions = {
  origin: '*',
  optionsSuccessStatus: 200,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
};

app.use(cors(corsOptions));

app.use(cookieParser());

const port = process.env.PORT || 3000
const mongo_dbname = process.env.MONGO_SERVER_DBNAME
const mongo_url = process.env.MONGO_SERVER_URL + ':' + process.env.MONGO_SERVER_PORT + '/' + mongo_dbname
const ldap_url = process.env.LDAP_SERVER_URL + ':' + process.env.LDAP_SERVER_PORT
const ldap_dn = process.env.LDAP_SERVER_DN
const ldap_admin = process.env.LDAP_SERVER_ADMIN
const ldap_password = process.env.LDAP_SERVER_PASSWORD
const pbi_report_url = process.env.PBI_SERVER_URL + ':' + process.env.PBI_SERVER_PORT_REVERSE + '/' + process.env.PBI_SERVER_REPORT_SUFFIX
const pbi_api_url = process.env.PBI_SERVER_URL + ':' + process.env.PBI_SERVER_PORT_REVERSE + '/' + process.env.PBI_SERVER_API_SUFFIX
const pbi_upload_url = process.env.PBI_SERVER_URL + ':' + process.env.PBI_SERVER_PORT_DEFAULT + '/' + process.env.PBI_SERVER_PORTAL_SUFFIX
const pbi_login = process.env.PBI_SERVER_LOGIN
const pbi_password = process.env.PBI_SERVER_PASSWORD

mongoose.connect(mongo_url).then(() => console.log("")).catch(err => console.log(err));

app.use(session({
    secret: "secret-key",
    saveUninitialized:true,
    cookie: { maxAge: 1000 * 60 * 60 * 24, secure: false },
    resave:false,
    store: MongoStore.create({ mongoUrl: mongo_url })
}));

const client = ldap.createClient({url:ldap_url});
client.on('connectError',(err) =>{console.log('Ldap not connected')})

async function firstUse(){
  const result = await profile.countDocuments({profile_name:'admins'}).then(f => f)
  if(result == 0){
    createProfile('admins',true)
    createUser('Admin','Pobi','adminpobi','admin','admin@example.com',(err,success)=>{})
    addUserToGroupLdap('admins','adminpobi',(err,success) =>{})
    updatePowershellScript()
  }
}

firstUse();

const encodeBase64 = (data) => {
  return Buffer.from(data,'utf-8').toString('base64');
}

function sleep(milliseconds) {
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
}

function updatePowershellScript(){
  const {exec} = require('node:child_process');
  try{
    let updateUsername = exec(`powershell "(Get-Content .\\upload.ps1).Replace('$userName = ','$userName = \"""${pbi_login}\"""') | Set-Content .\\upload.ps1"`)
    sleep(1000)
    let updatePassword = exec(`powershell "(Get-Content .\\upload.ps1).Replace('$userPassword = ','$userPassword = \"""${pbi_password}\"""') | Set-Content .\\upload.ps1"`)
    sleep(1000)
    let updateReport = exec(`powershell "(Get-Content .\\upload.ps1).Replace('$ReportPortal = ','$ReportPortal = \"""${pbi_upload_url}\"""') | Set-Content .\\upload.ps1"`)
  }catch(err){
    console.log(err)
  }
}

app.get('/', (req, res) => {
  req.session.destroy();
  res.sendFile(__dirname + '/login.html');
});

app.get("/login", (req, res)=>{
    res.sendFile(__dirname + "/login.html");
});

app.get("/get/dashboard", encodeUrl, async (req,res) => {
  let response = [];
  let dash_id = [];
  let dash_name = [];
  var ds = await dashboard.find().then(d => d);
  for(let x in ds){
    for(let y in ds[x]){
      if(y=='dash_id')dash_id.push(ds[x][y])
      if(y=='dash_name')dash_name.push(ds[x][y])
    }
  }
  for(let j in dash_id){
    response.push({'id':dash_id[j],'name':dash_name[j]})
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(response));
})

app.post("/profile/param",encodeUrl, async (req,res)=>{
  var param = req.body.param;
  var pf = await profile.find({profile_name:param}).then(f => f);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(pf));
});

app.post("/user/param",encodeUrl, async (req,res)=>{
  var param = req.body.param;
  var us = await custom.find({user_name:param}).then(u => u);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(us));
});

app.post("/manage/dashboard",encodeUrl, async (req,res)=>{
  var prof = req.body.profile;
  var isadmin = req.body.isadmin ? true :false;
  var report = req.body.report_profile;

  const filter = {profile_name: prof};
  const update = {is_admin: isadmin,dashboard:report};

  profile.updateOne(filter,update)
  .then(() => console.log("Profile updated"))
  .catch(err => console.log(err));
  
  res.send(userPage('Manage Dashboard','Profile Updated',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
});

app.post("/manage/user",encodeUrl, async (req,res)=>{
  var user = req.body.user;
  var report = req.body.report_user;
  
  const filter = {user_name: user};
  const update = {dashboard:report};
  const options = {upsert: true};
  if(report==undefined){
    custom.deleteOne(filter)
    .then(() => console.log("User deleted"))
    .catch(err => console.log(err));
  }else{
    custom.updateOne(filter,update,options)
    .then(() => console.log("User updated"))
    .catch(err => console.log(err));
  }
  res.send(userPage('Override Dashboard','Dashboard Overrided',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
});

function uploadDashboard(filename,callback){
  const {exec} = require('node:child_process');
  let result = [];
  try{
    let changereport = exec(`powershell "(Get-Content .\\upload.ps1).Replace('$ReportName = ','$ReportName = \"""${filename}\"""') | Set-Content .\\upload.ps1"`)
    sleep(3000)
    let ps = exec(`powershell ".\\upload.ps1"`)
    let revertreport = exec(`powershell "(Get-Content .\\upload.ps1).Replace('$ReportName = \"""${filename}\"""','$ReportName = ') | Set-Content .\\upload.ps1"`)
    ps.stdout.on('error',(error) => callback(error,null))
    ps.stdout.on('data', (data) => {result.push(data)})
    ps.stdout.on('end', () => callback(null,result))
  } catch(err){
    console.log(err)
  }
}

app.post('/manage/upload',multer.single('upload'),async (req, res) => {
  const upload_filename = req.file.originalname;
  uploadDashboard(upload_filename,(err,result) =>{
    if(!err){
      getDashboards();
      res.send(userPage('Upload Dashboard','Upload Dashboard Success',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
    }else{
      res.send(userPage('Upload Dashboard',err,req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group)); 
    }
  })
});

app.post("/manage/rls/create",encodeUrl, async (req,res)=>{
  var {rulename,dataset,column,operator,clause,affected} = req.body;
  let dash_name;
  let arg_clause = [];
  let check = 0;
  affected = affected.split(',')
  for(let y in affected){
    var rule_group = await rls_group.find({dataset:dataset,group:affected[y]}).then(g => g);
    if(rule_group.length>0)check++;
  }
  if(check>0){
    res.send(userPage('Manage Row Level Security','Group already have rule for same dataset',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
  }else{
    if(operator=='IN'){
      clause = clause.split(',')
      for(let x in clause){
        arg_clause.push({"clause":clause[x]})
      }
    }else{
      arg_clause.push({"clause":clause})
    }
    var dash = await dashboard.find({dash_id:dataset}).then(d => d);
    dash = JSON.stringify(dash);
    dash = dash.slice(1,-1);
    dash = JSON.parse(dash);
    for(let x in dash){
      if(x=='dash_name')dash_name = dash[x]
    }
    rule_id = randomUUID();
    await rls.create({rule_id:rule_id,rule_name:rulename,dash_id:dataset,dash_name:dash_name,dataset:dataset,kolom:column,operator:operator,clause:arg_clause})
    for(let x in affected){
      await rls_group.create({rule_id:rule_id,rule_name:rulename,dataset:dataset,group:affected[x]})
    }
    res.send(userPage('Manage Row Level Security','RLS Rule Created',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
  }
});

app.post("/manage/rls/delete",encodeUrl, async (req,res)=>{
  var ruleid = req.body.ruleid;
  const filter = {rule_id:ruleid};
  await rls_group.deleteMany(filter)
  await rls.deleteOne(filter)
  res.send(userPage('Manage Row Level Security','RLS Rule Deleted',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
})

app.post("/fetch/rule",encodeUrl, async(req,res) => {
  var report_id = req.body.report_id;
  var report_name = req.body.report_name;
  var group = req.body.group;
  var rule_group = await rls_group.find({dataset:report_id,group:group}).sort({dataset:1}).then(g => g);
  let arg_result = [];
  let data = {result:''};
  if(rule_group.length>0){
    rule_group = JSON.stringify(rule_group);
    rule_group = rule_group.slice(1,-1);
    rule_group = JSON.parse(rule_group);
    for(let x in rule_group){
      if(x=='rule_name')rule_name = rule_group[x]
    }
    var rl = await rls.find({rule_name:rule_name}).then(r => r);
    var clause = rl[0]['clause'];
    var arg_clause = ''
    for(i=0;i<clause.length;i++){
      for(let x in clause[i]){
        var newclause = clause[i][x].replaceAll(" ","_")
        arg_clause+=`'${newclause}'`
        if(i<clause.length-1)arg_clause+=','
      }
    }
    arg_result.push(`<div class="col"><div class="card text-bg-light mb-3" style="max-width: 12rem;"><div class="card-header">${report_name}</div><div class="card-body"><a href="#" class="btn btn-primary" onclick=reportChange("${group}","${rl[0]['dash_name']}","${rl[0]['kolom']}","${rl[0]['operator']}","${arg_clause}")>View</a></div></div></div>`)
  }
  data = {result:arg_result};
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
})

app.post("/fetch/rule/rls",encodeUrl, async(req,res) => {
  var dataset = req.body.dataset;
  var rule = await rls.find({dash_id:dataset}).then(r => r);
  let counter = 0;
  let result = '<div class="accordion" id="accordionRule">'
  for(let x in rule){
    var arg_clause = ''
    var clause = rule[x]['clause'];
    for(i=0;i<clause.length;i++){
      for(let x in clause[i]){
        arg_clause+=`'${clause[i][x]}'`
        if(i<clause.length-1)arg_clause+=','
      }
    }
    arg_clause = arg_clause.replaceAll("'","")
    var group = await rls_group.find({rule_id:rule[x]['rule_id']}).then(g => g);
    let arg_group = [];
    var board = await dashboard.find().then(b => b);
    result+=`
    <div class="accordion-item">
    <h2 class="accordion-header">
      <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${x}" aria-expanded="false" aria-controls="collapse${x}">
        <b>${rule[x]['rule_name']}</b>&nbsp;&nbsp;&nbsp;<div class="text-end"><form action="/manage/rls/delete" method="POST"><input type="hidden" name="ruleid" id="ruleid" value="${rule[x]['rule_id']}"><input type="submit" value="Delete" class="btn btn-primary"></form></div>
      </button>
    </h2>
    <div id="collapse${x}" class="accordion-collapse collapse" data-bs-parent="#accordionRule">
      <div class="accordion-body">
        <div class="card-body"><form action="/manage/rls/update" method="POST" class="needs-validation"><label for="rulename">Rule Name</label>&nbsp;<input type="textbox" id="rulename" name="rulename" style="margin-bottom:12px" value="${rule[x]['rule_name']}" required><div class="invalid-feedback">Rule name cannot empty</div><br /><label for="dataset">Dataset </label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<select id="dataset" name="dataset">`;
    for(let y in board){
      result+=`<option value="${board[y]['dash_id']}"`
      if(rule[x]['dataset']==board[y]['dash_id']){result+=` selected="selected"`}else{result+=``}
      result+=`>${board[y]['dash_name']}</option>`
    }
    result+=`</select>&nbsp;&nbsp;&nbsp;<label for="column">Column </label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<select id="column" name="column" onchange="javascript:void()">`;
    result+=`<option value="WILAYAH">WILAYAH</option>`;
    if(rule[x]['kolom']=='WILAYAH'){result+=` selected="selected"`}else{result+=``}
    result+=`<option value="REGIONAL"`;
    if(rule[x]['kolom']=='REGIONAL'){result+=` selected="selected"`}else{result+=``}
    result+=`>REGIONAL</option>`;
    result+=`<option value="AREA"`;
    if(rule[x]['kolom']=='AREA'){result+=` selected="selected"`}else{result+=``}
    result+=`>AREA</option>`;
    result+=`<option value="CABANG"`;
    if(rule[x]['kolom']=='CABANG'){result+=` selected="selected"`}else{result+=``}
    result+=`>CABANG</option></select>&nbsp;&nbsp;&nbsp;<label for="operator">Operator </label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<select id="operator" name="operator">`;
    result+=`<option value="="`;
    if(rule[x]['operator']=='='){result+=` selected="selected"`}else{result+=``}
    result+=`>=</option>`;
    result+=`<option value="IN"`;
    if(rule[x]['operator']=='IN'){result+=` selected="selected"`}else{result+=``}
    result+=`>IN</option>`;
    result+=`</select>&nbsp;&nbsp;&nbsp;<label for="clause">Clause</label>&nbsp;<input type="textbox" id="clause" name="clause" value="${arg_clause}" required><div class="invalid-feedback">Clause cannot empty</div><br><br><div class="flexcontainer"><div><br><br><br><label for="group_list_rls_${x}">Select Group </label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<select id="group_list_rls_${x}" name="group_list_rls_${x}" onchange="javascript:void()"></select></div><div><br><input type="button" value="Add" onclick="AddGroup('group_affected_${x}','group_list_rls_${x}','affected_${x}')" class="btn btn-primary"><br><br><input type="button" value="Remove" onclick="RemoveGroup('group_affected_${x}','affected_${x}')" class="btn btn-primary"></div><div><b>Group Affected</b><br><select id="group_affected_${x}" name="group_affected_${x}" class="form-select" size="7">`;
    for(let y in group){
      result+=`<option value="${group[y]['group']}">${group[y]['group']}</option>`
      arg_group.push(group[y]['group'])
    }
    result+=`</select><br></div></div><input type="hidden" id="rule_id" name="rule_id" value="${rule[x]['rule_id']}"><input type="hidden" id="affected_${x}" name="affected_${x}" value="${arg_group}"><input type="submit" value="Update" class="btn btn-primary"></form></div>
      </div>
    </div>
  </div>`
  counter++;
  }
  result+=`</div>`
  data = {result:result,counter:counter}
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
})

app.get("/get/ldap/groups",encodeUrl, async(req,res) => {
  getLdapGroups((err,data) => {
    let groups = [];
    for(let x in data){
      for(let y in data[x]){
        groups.push(data[x][y])
      }
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(groups));
  })
})

app.post("/get/ldap/users",encodeUrl, async(req,res) => {
  var exclude_user = req.body.exclude_user;
  getLdapUsers((err,data) => {
    let users = [];
    for(let x in data){
      for(let y in data[x]){
        users.push(data[x][y])
      }
    }
    if(exclude_user!=null || exclude_user!=undefined){
      for(let x in exclude_user){
        const idx = users.indexOf(exclude_user[x])
        if(idx>-1)users.splice(idx,1)
      }
    }
    res.setHeader('Content-type', 'application/json');
    res.end(JSON.stringify(users))
  })
})

app.post("/get/ldap/usergroup",encodeUrl, async(req,res) => {
  var group = req.body.group;
  var exclude_item = req.body.exclude_item;
  getLdapUsergroup(group,(err,data) => {
    let usergroup = [];
    for(let x in data){
      for(let y in data[x]){
        usergroup.push(data[x][y])
      }
    }
    if(exclude_item!=null || exclude_item!=undefined){
      const idx = usergroup.indexOf(exclude_item)
      if(idx>-1)usergroup.splice(idx,1)
    }
    res.setHeader('Content-type', 'application/json');
    res.end(JSON.stringify(usergroup))
  })
})

app.post("/manage/rls/update",encodeUrl, async (req,res)=>{
  var {rule_id,rulename,dataset,column,operator,clause} = req.body;
  if(req.body.affected_0){affected=req.body.affected_0}
  if(req.body.affected_1){affected=req.body.affected_1}
  if(req.body.affected_2){affected=req.body.affected_2}
  if(req.body.affected_3){affected=req.body.affected_3}
  if(req.body.affected_4){affected=req.body.affected_4}
  if(req.body.affected_5){affected=req.body.affected_5}
  if(req.body.affected_6){affected=req.body.affected_6}
  if(req.body.affected_7){affected=req.body.affected_7}
  if(req.body.affected_8){affected=req.body.affected_8}
  if(req.body.affected_9){affected=req.body.affected_9}
  if(req.body.affected_10){affected=req.body.affected_10}
  let dash_name;
  let arg_clause = [];
  affected = affected.split(',')
  if(operator=='IN'){
    clause = clause.split(',')
    for(let x in clause){
      arg_clause.push({"clause":clause[x]})
    }
  }else{
    arg_clause.push({"clause":clause})
  }
  var dash = await dashboard.find({dash_id:dataset}).then(d => d);
  dash = JSON.stringify(dash);
  dash = dash.slice(1,-1);
  dash = JSON.parse(dash);
  for(let x in dash){
    if(x=='dash_name')dash_name = dash[x]
  }
  const filter = {rule_id:rule_id};
  const update = {rule_id:rule_id,rule_name:rulename,dash_id:dataset,dash_name:dash_name,dataset:dataset,kolom:column,operator:operator,clause:arg_clause};
  await rls.updateOne(filter,update)
  await rls_group.deleteMany(filter)
  for(let x in affected){
    await rls_group.create({rule_id:rule_id,rule_name:rulename,dataset:dataset,group:affected[x]})
  }
  res.send(userPage('Manage Row Level Security','RLS Rule Updated',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
})

function get_ldap_user(){
  client.bind(`cn=${ldap_admin},${ldap_dn}`,`${ldap_password}`,(err) => {
  var result = [];
    if(err){
      console.log(err)
    }else{
      const opts = {filter:'(objectClass=Person)',scope:'sub',attributes:['cn']};
      client.search(`${ldap_dn}`,opts,(err,res) =>{
        var j = 0;
        res.on('searchEntry', (entry) => {
          var entries = JSON.stringify(entry.pojo).toLocaleLowerCase();
          var ent = JSON.parse(entries);
          var arr_ent = [];
          for(let x in ent){
            arr_ent.push(ent[x]+",")
          }
          var obj_arr = arr_ent[3].split(',');
          var obj = [];
          for(let y in obj_arr){
            if(y==0)obj.push(obj_arr[y].substring(4))
          }
          result[j] = {'user':obj};
          j++;
        });
        res.on('error', (err) => {
          console.error('error: ' + err.message);
        });
      })
    }
  })
}
get_ldap_user();

function get_ldap_profile(user_ldap){
  client.bind(`cn=${ldap_admin},${ldap_dn}`,`${ldap_password}`,(err) => {
    if(err){
      console.log(err)
    }else{
      const opts = {filter:'(&(objectClass=person)(memberof=cn=*,ou=people))',scope:'sub',attributes:['cn']};
      client.search(`${ldap_dn}`,opts,(err,res) =>{
        res.on('searchRequest', (searchRequest) => {
          console.log('searchRequest: ', searchRequest.messageId);
        });
        res.on('searchEntry', (entry) => {
          console.log('entry: ' + JSON.stringify(entry.pojo));
        });
        res.on('searchReference', (referral) => {
          console.log('referral: ' + referral.uris.join());
        });
        res.on('error', (err) => {
          console.error('error: ' + err.message);
        });
        res.on('end', (result) => {
          console.log('status: ' + result.status);
        });
      })
    }
  })
}

function checkUser(username, callback){
  const opts = {filter:`(uid=${username})`,scope:'sub'};
  client.search(`${ldap_dn}`,opts,(err,res) =>{
    let found = false;
    res.on('searchEntry', () => found = true);
    res.on('end', () => callback(null, found));
  })
}

function checkGroup(groupname, callback){
  const opts = {filter:`cn=${groupname}`,scope:'sub'};
  client.search(`ou=groups,${ldap_dn}`,opts,(err,res) =>{
    let found = false;
    res.on('searchEntry', () => found = true);
    res.on('end', () => callback(null, found));
  })
}

function getAllUser(callback){
  const opts = {filter:'(objectClass=Person)',scope:'sub',attributes:['cn']};
  client.search(`${ldap_dn}`,opts,(err,res,ret) =>{
    let result = [];
    res.on('searchEntry', (entry) => result.push(JSON.parse(JSON.stringify(entry.pojo).toLocaleLowerCase())));
    res.on('end', () => callback(null, result));
  })
}

function getLdapUsers(callback){
  getAllUser((err,entry) => {
    var data_split = [];
    var data_user = [];
    for(x=0;x<entry.length;x++){
      for(let y in entry[x]){
        if(y=='objectname')data_split.push(entry[x][y].split(',')[0])
      }
    }
    for(let j in data_split){
      data_user.push({'user':data_split[j].substring(4)})
    }
    callback(null,data_user);
  })
}
  
function getAllGroup(callback){
  const opts = {filter:'(objectClass=groupOfUniqueNames)',scope:'sub',attributes:['cn']};
  client.search(`${ldap_dn}`,opts,(err,res) =>{
    let result = [];
    res.on('searchEntry', (entry) => result.push(JSON.parse(JSON.stringify(entry.pojo).toLocaleLowerCase())));
    res.on('end', () => callback(null, result));
  })
}

function getLdapGroups(callback){
  getAllGroup((err,entry) => {
    var data_split = [];
    var data_group = [];
    for(x=0;x<entry.length;x++){
      for(let y in entry[x]){
        if(y=='objectname')data_split.push(entry[x][y].split(',')[0])
      }
    }
    for(let j in data_split){
      data_group.push({'profile':data_split[j].substring(3)})
    }
    callback(null,data_group);
  })
}

function getAllUsergroup(group,callback){
  const opts = {filter:`(memberOf=cn=${group},ou=groups,${ldap_dn})`,scope:'sub',attributes:['cn']};
  client.search(`${ldap_dn}`,opts,(err,res) =>{
    let result = [];
    res.on('searchEntry', (entry) => result.push(JSON.parse(JSON.stringify(entry.pojo).toLocaleLowerCase())));
    res.on('end', () => callback(null, result));
  })
}

function getLdapUsergroup(group,callback){
  getAllUsergroup(group,(err,entry) => {
    var data_split = [];
    var data_usergroup = [];
    for(x=0;x<entry.length;x++){
      for(let y in entry[x]){
        if(y=='objectname')data_split.push(entry[x][y].split(',')[0])
      }
    }
    for(let j in data_split){
      data_usergroup.push({'usergroup':data_split[j].substring(4)})
    }
    callback(null,data_usergroup);
  })
}

function addUserToGroupLdap(group,user,callback){
  var groupDn = `cn=${group},ou=groups,${ldap_dn}`
  var userDn = `uid=${user},ou=people,${ldap_dn}`
  const memberAttribute = new ldap.Attribute({
    type: 'uniquemember',
    values: userDn
  });
  var change = new ldap.Change({
    operation: 'add',
    modification: memberAttribute
  })
  client.modify(groupDn,change, (addError) => {
    if(addError) {console.log(addError);return callback(null, false)};
    callback(null, true);
  })
}

function removeUserFromGroupLdap(group,user,callback){
  var groupDn = `cn=${group},ou=groups,${ldap_dn}`
  var userDn = `uid=${user},ou=people,${ldap_dn}`
  const memberAttribute = new ldap.Attribute({
    type: 'uniquemember',
    values: userDn
  });
  var change = new ldap.Change({
    operation: 'delete',
    modification: memberAttribute
  })
  client.modify(groupDn,change, (removeError) => {
    if(removeError) {console.log(removeError);return callback(null, false)};
    callback(null, true);
  })
}

function createUser(firstname,lastname,username,password,email,callback){
  client.bind(`cn=${ldap_admin},${ldap_dn}`,`${ldap_password}`,(err) => {
    const newdn = `uid=${username},ou=people,${ldap_dn}`
    const newentry = {
      uid:username,
      cn:username,
      userPassword:ssha.create(password),
      mail:email,
      givenName:firstname,
      sn:lastname,
      objectClass:['person', 'inetOrgPerson']
    }
    client.add(newdn, newentry, (addError) => {
      if(addError) return callback(null, false);
      callback(null, true);
    });
  });
}

function createGroup(groupname,callback){
  client.bind(`cn=${ldap_admin},${ldap_dn}`,`${ldap_password}`,(err) => {
    const newdn = `cn=${groupname},ou=groups,${ldap_dn}`
    const newentry = {
      cn:groupname,
      uniqueMember:`uid=test,ou=people,${ldap_dn}`,
      objectClass:['top','groupOfUniqueNames']
    }
    client.add(newdn,newentry,(addError) =>{
      if(addError) {console.log(addError);return callback(null, false)};
      callback(null, true);
    });
  });
}

async function createProfile(groupname,is_admin){
  return await profile.create({profile_name:groupname,is_admin:is_admin,dashboard:[]}).then(p => p);
}

app.post("/ldap/create/user",encodeUrl, async (req,res)=>{
  const {firstname,lastname,username,password,email} = req.body;
  checkUser(username,(err,userExists) => {
    if(userExists){
      res.send(userPage('Create User LDAP','User Exists',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
    }else{
      createUser(firstname,lastname,username,password,email,(err,success)=>{
        if(!success){
          res.send(userPage('Create User LDAP','Failed to add user',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
        }else{
          res.send(userPage('Create User LDAP','User Added',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
        }
      })
    }
  })
});

app.post("/ldap/create/group",encodeUrl, async (req,res)=>{
  const groupname = req.body.groupname;
  checkGroup(groupname,(err,groupExists) => {
    if(groupExists){
      res.send(userPage('Create Group LDAP','Group Exists',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
    }else{
      createProfile(groupname,false)
      createGroup(groupname,(err,success) =>{
        if(!success){
          res.send(userPage('Create Group LDAP','Failed to add group',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
        }else{
          res.send(userPage('Create Group LDAP','Group Added',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
        }
      })
    }
  })
});

app.post("/ldap/manage/group",encodeUrl, async (req,res)=>{
  const groupmember = req.body.group_member;
  const groupname = req.body.group_list_ldap;
  const mode = req.body.ldap_mode;
  if(mode==1){
    addUserToGroupLdap(groupname,groupmember,(err,success) =>{
      if(!success){
        res.send(userPage('Add User to LDAP Group','Failed add user to group',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
      }else{
        res.send(userPage('Add User to LDAP Group','User Added',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
      }
    })
  }else if(mode==2){
    const user = req.body.ldap_user;
    removeUserFromGroupLdap(groupname,user,(err,success) => {
      if(!success){
        res.send(userPage('Remove User From LDAP Group','Failed remove user from group',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
      }else{
        res.send(userPage('Remove User From LDAP Group','User Removed',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
      }
    })
  }
})

app.post("/configuration/ldap",encodeUrl, async (req,res)=>{
  const { ldap_url,ldap_dn,ldap_admin,ldap_password } = req.body;
  const id = 1
  const update = ldap_password === '' ? {ldap_url: ldap_url,ldap_dn: ldap_dn,ldap_admin: ldap_admin}:{ldap_url: ldap_url,ldap_dn: ldap_dn,ldap_admin: ldap_admin,ldap_password: ldap_password};
  const filter = {id: id};
  const options = {upsert: true};
  config.updateOne(filter,update,options)
  .then(() => res.send(userPage('LDAP Server Configuration','LDAP Config Updated',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group)))
  .catch(err => res.send(userPage('LDAP Server Configuration','LDAP Config Failed',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group)));
});

app.post("/configuration/pbi",encodeUrl, async (req,res)=>{
  const { pbi_url,pbi_login,pbi_password } = req.body;
  const id = 1
  const update = pbi_password === '' ? {pbi_url: pbi_url,pbi_login: pbi_login}:{pbi_url: pbi_url,pbi_login: pbi_login,pbi_password: pbi_password};
  const filter = {id: id};
  const options = {upsert: true};
  config.updateOne(filter,update,options)
  .then(() => res.send(userPage('Power BI Server Configuration','Power BI Config Updated',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group)))
  .catch(err => res.send(userPage('Power BI Server Configuration','Power BI Config Failed',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group)));
});

function getDashboards(){
  const credential = pbi_login + ':' + pbi_password
  const response = fetch(`${pbi_api_url}`,{
    method: "GET",
    headers: {
      "Content-type": "application/json",
      "Authorization": `Basic ${encodeBase64(credential)}`
    }
  })
  .then((response) => response.json())
  .then((json) => {
    let dash_id,dash_name;
    var result = json;
    var resultvar = result['value'];
    for(let x in resultvar){
      for(let y in resultvar[x]){
        if(y=='Id')dash_id = resultvar[x][y]
        if(y=='Name')dash_name = resultvar[x][y]
      }
      const update = {dash_id: dash_id,dash_name: dash_name}
      const filter = {dash_name: dash_name};
      const options = {upsert: true};
      dashboard.updateOne(filter,update,options).then(() => console.log('Dashboard Updated')).catch(err => console.log(err))
    }
  })
}

app.post("/dashboard", encodeUrl, async (req, res)=>{
    try{
      var username = req.body.username;
      var password = req.body.password;
      let options = {
        ldapOpts: {
          url: `${ldap_url}`,
        },
        adminDn: `cn=${ldap_admin},${ldap_dn}`,
        adminPassword: `${ldap_password}`,
        userPassword: password,
        userSearchBase: `${ldap_dn}`,
        usernameAttribute: 'uid',
        username: username,
        groupsSearchBase: `${ldap_dn}`,
        groupClass: 'groupOfUniqueNames',
        groupMemberAttribute: 'uniqueMember',
      }
      let user = await authenticate(options)
      if(user){
        if(!req.session.users){req.session.users=username}
        var json_user = JSON.stringify(user)
        var j = JSON.parse(json_user)
        for (let p in j) {
          if(p=="groups"){
            var group = j[p]
            }
          }
          for (let k in group[group.length-1]) {
            if(k=="attributes"){
              var attrib = group[group.length-1][k]
            }
          }
          for (let x in attrib){
            if(attrib[x]['type']=="cn"){
              var groups = attrib[x]['values'][0];
              const filter = {profile_name: groups};
              var roleuser = await profile.find(filter).then(function(data){var is_admins = JSON.stringify(data[0]["is_admin"]) === null || JSON.stringify(data[0]["is_admin"]) === undefined ? false:JSON.stringify(data[0]["is_admin"]);return is_admins;}).catch(function(err){console.log(err)})
            }
          }
          if(!req.session.user_group){req.session.user_group=groups}
          if(!req.session.role){req.session.role=JSON.stringify(roleuser)}
          var dashid = [];
          var dashname = [];
          var cus = await custom.findOne({user_name:req.session.users}).then(c => c);
          if(cus!==null){
            if(typeof(cus['dashboard'])=='object'){
              for(let c in cus['dashboard']){
                dashid.push({'id':cus['dashboard'][c]});
                var dash = await dashboard.findOne({dash_id:cus['dashboard'][c]}).then(d => d);
                dash = JSON.parse(JSON.stringify(dash));
                for(let x in dash){
                  if(x=='dash_name')dashname.push({'name':dash[x]});
                }
              }
              if(!req.session.reportid){req.session.reportid=JSON.stringify(dashid)}
              if(!req.session.reportname){req.session.reportname=JSON.stringify(dashname)}
            }else if(typeof(cus['dashboard'])=='string'){
              dashid.push({'id':cus['dashboard']});
              var dash = await dashboard.findOne({dash_id:cus['dashboard']}).then(d => d);
              dash = JSON.parse(JSON.stringify(dash));
              for(let x in dash){
                if(x=='dash_name')dashname.push({'name':dash[x]});
              }
              if(!req.session.reportid){req.session.reportid=JSON.stringify(dashid)}
              if(!req.session.reportname){req.session.reportname=JSON.stringify(dashname)}
            }
          }else{
            if(req.session.user_group!=null){
              var pfs = await profile.findOne({profile_name:req.session.user_group}).then(p => p);
              if(typeof(pfs['dashboard'])=='object'){
                for(let c in pfs['dashboard']){
                  dashid.push({'id':pfs['dashboard'][c]});
                  var dash = await dashboard.findOne({dash_id:pfs['dashboard'][c]}).then(d => d);
                  dash = JSON.parse(JSON.stringify(dash));
                  for(let x in dash){
                    if(x=='dash_name')dashname.push({'name':dash[x]});
                  }
                }
                if(!req.session.reportid){req.session.reportid=JSON.stringify(dashid)}
                if(!req.session.reportname){req.session.reportname=JSON.stringify(dashname)}
              }else if(typeof(pfs['dashboard'])=='string'){
                dashid.push({'id':pfs['dashboard']});
                var dash = await dashboard.findOne({dash_id:pfs['dashboard']}).then(d => d);
                dash = JSON.parse(JSON.stringify(dash));
                for(let x in dash){
                  if(x=='dash_name')dashname.push({'name':dash[x]});
                }
                if(!req.session.reportid){req.session.reportid=JSON.stringify(dashid)}
                if(!req.session.reportname){req.session.reportname=JSON.stringify(dashname)}
              }
            }
          }
          var all_dash = await dashboard.find().then(a => a);
          all_dash = JSON.parse(JSON.stringify(all_dash));
          var all_dash_id = [];
          var all_dash_name = [];
          for(x=0;x<all_dash.length;x++){
            for(let y in all_dash[x]){
              if(y=='dash_id')all_dash_id.push({'id':all_dash[x][y]})
              if(y=='dash_name')all_dash_name.push({'name':all_dash[x][y]})
            }
          }
          if(!req.session.alldashid){req.session.alldashid=JSON.stringify(all_dash_id)}
          if(!req.session.alldashname){req.session.alldashname=JSON.stringify(all_dash_name)}
          res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': 0
          });
          res.send(userPage(header='Welcome to POBI',msg='Your Power BI Dashboard Viewer',req.session.users,req.session.role,req.session.reportid,req.session.reportname,req.session.alldashid,req.session.alldashname,req.session.user_group));
        }
    }catch(e){
        res.redirect('/')
    }
});

function userPage(header,msg,users,role,reportid,reportname,dashid,dashname,user_group){
  var repid = reportid != undefined ? JSON.parse(reportid):console.log('');
  var repname = reportname != undefined ? JSON.parse(reportname):console.log('');
  var dashid = dashid != undefined ? JSON.parse(dashid):console.log('');
  var dashname = dashname != undefined ? JSON.parse(dashname):console.log('');
  var maincontent =`
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <title>POBI</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link href="/css/bootstrap.min.css" rel="stylesheet" crossorigin="anonymous">
      <script src="/js/bootstrap.min.js" crossorigin="anonymous"></script>
    <style>
    .bd-placeholder-img {
      font-size: 1.125rem;
      text-anchor: middle;
      -webkit-user-select: none;
      -moz-user-select: none;
      user-select: none;
    }

    @media (min-width: 768px) {
      .bd-placeholder-img-lg {
        font-size: 3.5rem;
      }
    }

    .b-example-divider {
      width: 100%;
      height: 3rem;
      background-color: rgba(0, 0, 0, .1);
      border: solid rgba(0, 0, 0, .15);
      border-width: 1px 0;
      box-shadow: inset 0 .5em 1.5em rgba(0, 0, 0, .1), inset 0 .125em .5em rgba(0, 0, 0, .15);
    }

    .b-example-vr {
      flex-shrink: 0;
      width: 1.5rem;
      height: 100vh;
    }

    .bi {
      vertical-align: -.125em;
      fill: currentColor;
    }

    .nav-scroller {
      position: relative;
      z-index: 2;
      height: 2.75rem;
      overflow-y: hidden;
    }

    .nav-scroller .nav {
      display: flex;
      flex-wrap: nowrap;
      padding-bottom: 1rem;
      margin-top: -1px;
      overflow-x: auto;
      text-align: center;
      white-space: nowrap;
      -webkit-overflow-scrolling: touch;
    }

    .btn-bd-primary {
      --bd-violet-bg: #712cf9;
      --bd-violet-rgb: 112.520718, 44.062154, 249.437846;
      --bs-btn-font-weight: 600;
      --bs-btn-color: var(--bs-white);
      --bs-btn-bg: var(--bd-violet-bg);
      --bs-btn-border-color: var(--bd-violet-bg);
      --bs-btn-hover-color: var(--bs-white);
      --bs-btn-hover-bg: #6528e0;
      --bs-btn-hover-border-color: #6528e0;
      --bs-btn-focus-shadow-rgb: var(--bd-violet-rgb);
      --bs-btn-active-color: var(--bs-btn-hover-color);
      --bs-btn-active-bg: #5a23c8;
      --bs-btn-active-border-color: #5a23c8;
    }

    .bd-mode-toggle {
      z-index: 1500;
    }

    .bd-mode-toggle .dropdown-menu .active .bi {
      display: block !important;
    }
    body {
      background-color:#fff;
      font-family:'Arial';
    }
    h1{
      color:#fff;
      text-align:center;
      }

    .acc-kontainer {
      width: 25%;
      margin: 0;
    }
    .acc-kontainer .acc-body {
      width: 25%;
      width: calc(100% - 20px);
      margin: 0 auto;
      height: 0;
      color: rgba(0, 0, 0, 0);
      background-color: rgba(163, 160, 153, 0.2);
      line-height: 28px;
      padding: 0 5px;
      box-sizing: border-box;
      transition: 0.5s;
    }

    .acc-kontainer div {
      cursor: pointer;
      background-color: rgba(163, 160, 153, 0.1);
      border-bottom: 1px solid rgba(163, 160, 153, 0.1);
      display: block;
      padding: 15px;
      width: 100%;
      color: #000;
      font-weight: 400;
      box-sizing: border-box;
      z-index: 100;
    }

    .acc-kontainer .acc-body {
      height: auto;
      color: #000;
      font-size: 16px;
      padding: 20px;
      background-color: rgba(163, 160, 153, 0.1);
    }
    #main-container{
      min-width: 990px;
    }
    .flexcontainer{
      display: flex;
    }
    .flexcontainer > div {
      flex: 1;
    }
    .wraps{
      display: flex;
      flex-wrap: wrap;
      flex-direction: row;
      width: 100%;
    }
    .wrap-side{
      width:20%;
    }
    .wrap-main{
      width:80%;
    }
    .wrap-extra{
      width:80%;
      padding:0 10px 0 10px;
    }
    .wrap-center{
      width:49%;
    }
    #itemshield {
      position: relative;
      float: right;
      width: 34px;
      height: 750px;
      background: #eaeaea;
    }
    .panel {
      position: relative;
      height: 0;
      overflow: hidden;
    }
    .panelcontainer {
      padding-bottom: 56.25%;
    }
    .panel iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: white;
    }
    </style>
  </head>
<body>
<header class="navbar sticky-top flex-md-nowrap p-0 shadow bg-primary" data-bs-theme="dark">
<a class="navbar-brand col-md-3 col-lg-2 me-0 px-3 fs-6 text-white" href="#">POBI</a>
<p class="text-right text-white" style="margin:5px;">Hi, ${users} | <a href="/" style="text-decoration:none;color:#fff"> Log Out</a></p>
</header>
<div class="d-flex wraps">
<div class="acc-kontainer wrap-side">          
<div>
<a href="javascript:void(0);" style="text-decoration:none;" onclick="showDash()">Dashboard</a>`;
maincontent+=`
</div>`;
 if(role!=undefined){
  if(JSON.parse(role)=='true'){
    maincontent+=`
    <div>
      <a href="javascript:void(0);" style="text-decoration:none;">Manage</a>
      <div class="acc-body">
        <a href="javascript:void(0);" style="text-decoration:none;" onclick="manageDash()">Dashboard</a>
      </div>
      <div class="acc-body">
        <a href="javascript:void(0);" style="text-decoration:none;" onclick="manageLdap()">LDAP</a>
      </div>
      <div class="acc-body">
        <a href="javascript:void(0);" style="text-decoration:none;" onclick="manageRls()">Row Level Security</a>
      </div>
  </div>`;
  }
}
maincontent+=`</div>
<div class="container wrap-main" id="main-container" style="margin-top:5px;"><div class="card text-bg-light mb-3"><div class="card-header"><b>`;
maincontent+=header
maincontent+=`</b><div class="card-body">`
maincontent+=msg;
maincontent+=`</div></div></div></div><div class="wrap-side"></div><div id="extra-container" class="wrap-extra"></div>
<script>
var content = document.getElementById("main-container");
var extra = document.getElementById("extra-container");
var manageConf = function(){
contents = '<div class="wraps"><div class="card text-bg-light mb-3 wrap-center" style="margin-right:10px;"><div class="card-header"><b>LDAP Server</b></div><div class="card-body"><form action="/configuration/ldap" method="POST" class="needs-validation"><label for="ldap_url" style="width:220px">LDAP Url</label><input type="textbox" id="ldap_url" name="ldap_url" style="margin-bottom:12px" size=27 autofocus required><br /><label for="ldap_dn" style="width:220px">Distinguished Name(DN)</label><input type="textbox" id="ldap_dn" name="ldap_dn" style="margin-bottom:12px" size=25 required><br /><label for="ldap_admin" style="width:220px">LDAP Administrator</label><input type="textbox" id="ldap_admin" name="ldap_admin" style="margin-bottom:12px" required size=12><br /><label for="ldap_password" style="width:220px">LDAP Password</label><input type="password" id="ldap_password" name="ldap_password" style="margin-bottom:12px" size=12><span style="font:14px arial bold;margin-left:5px;">(Fill to change)</span><br /><input type="submit" value="Save" class="btn btn-primary"></form></div></div><div class="card text-bg-light mb-3 wrap-center"><div class="card-header"><b>Power BI Server</b></div><div class="card-body"><form action="/configuration/pbi" method="POST" class="needs-validation"><label for="pbi_url" style="width:220px">Power BI Server Url</label><input type="textbox" id="pbi_url" name="pbi_url" style="margin-bottom:12px" size=27 required><br /><label for="pbi_login" style="width:220px">Windows Login</label><input type="pbi_login" id="pbi_login" name="pbi_login" style="margin-bottom:12px" size=25 required><br /><label for="pbi_password" style="width:220px">Windows Password</label><input type="password" id="pbi_password" name="pbi_password" style="margin-bottom:12px" size=12><span style="font:14px arial bold;margin-left:5px;">(Fill to change)</span><br /><input type="submit" value="Save" class="btn btn-primary"></form></div></div></div';
content.innerHTML = contents;
content.style.height = '700px';
getLdapUsers('user',null);
getRuleRls(null);
getConfig();
}
var manageDash = function(){
contents = '<div class="wraps"><div class="card text-bg-light mb-3 wrap-center" style="margin-right:10px;"><div class="card-header"><b>Manage Dashboard</b></div><div class="card-body"><form action="/manage/dashboard" method="POST"><label for="profile">Profile </label>&nbsp;<select id="profile" name="profile" onchange="getProf(this.value)">`
maincontent+=`</select><br><input type="checkbox" id="isadmin" name="isadmin" value="true"><label for="isadmin">&nbsp;is admin ?</label><br><input type="checkbox" id="selectall" name="selectall" value="selectall" onclick="selectAllProfile(this)"><label for="selectall">&nbsp;Select All</label><br><span id="box_profile">`
maincontent+=`</span><div class="invalid-feedback">Please select a dashboard</div><br><input type="submit" value="Save" class="btn btn-primary"></form></div></div>';
//content.innerHTML = contents;
contents+= '<div class="card text-bg-light mb-3 wrap-center"><div class="card-header"><b>Override Dashboard</b></div><div class="card-body"><form action="/manage/user" method="POST"><label for="user">User </label>&nbsp;<select id="user" name="user" onchange="getUser(this.value)">`
maincontent+=`</select><br><input type="checkbox" id="selectall" name="selectall" value="selectall" onclick="selectAllUser(this)"><label for="selectall">&nbsp;Select All</label><br><span id="box_user">`
maincontent+=`</span><br><input type="submit" value="Save" class="btn btn-primary"></form></div></div></div>';
contents+= '<div class="card text-bg-light mb-3" style="margin-top:5px;width:49%"><div class="card-header"><b>Upload Dashboard</b></div><div class="card-body"><form action="/manage/upload" method="POST" enctype="multipart/form-data" class="needs-validation"><label for="upload">Choose File :&nbsp;&nbsp;</label><input type="file" id="upload" name="upload" accept=".pbix" required /><br><input type="submit" value="Upload" class="btn btn-primary"></form></div></div>';
content.innerHTML = contents;
content.style.height = '700px';
getLdapGroups('profile');
getLdapUsers('user',null);
getRuleRls(null)
getDashboard(1,'report_profile','box_profile')
getDashboard(1,'report_user','box_user')
};
var manageUser = function(){
contents = '<div class="card text-bg-light mb-3"><div class="card-header"><b>Manage User</b></div><br /><div class="card-body"><form action="/manage/user" method="POST"><label for="user">User </label>&nbsp;<select id="user" name="user" onchange="getUser(this.value)">`
maincontent+=`</select><br><input type="checkbox" id="selectall" name="selectall" value="selectall" onclick="selectAll(this)"><label for="selectall">&nbsp;Select All</label><br>`
for(let x in dashid){
  maincontent+=`<input type="checkbox" name="report" id="${dashname[x]['name']}" value="${dashid[x]['id']}"><label for="${dashname[x]['name']}">&nbsp;${dashname[x]['name']}</label><br>`
}
maincontent+=`<br><input type="submit" value="Save" class="btn btn-primary"></form></div></div>';
content.innerHTML = contents;
content.style.height = '700px';
getLdapUsers('user',null);
getRuleRls(null)
}
var showDash = function(){
contents = '<div class="card text-bg-light mb-3" style="margin-top:5px"><div class="card-header"><b>Dashboard List</b></div><div class="card-body"><div id="report-container" class="row row-cols-1 row-cols-md-3 g-4"></div></div>';
content.innerHTML = contents;content.style.height = '700px';getRuleRls(null);`
for(let x in repid){
  maincontent+=`getRule("${repid[x]['id']}","${repname[x]['name']}","${user_group}");`
}
maincontent+=`}
var selectAllProfile = function(source){
 checkboxes = document.getElementsByName("report_profile");
 for(var i=0;i<checkboxes.length;i++){
    checkboxes[i].checked = source.checked;
 }
}
var selectAllUser = function(source){
 checkboxes = document.getElementsByName("report_user");
 for(var i=0;i<checkboxes.length;i++){
    checkboxes[i].checked = source.checked;
 }
}
var getDashboard = function(eltype,elname,elbox){
  let dashboard = '';
  var dash = fetch("/get/dashboard",{
    method: "GET",
    headers: {
      "Content-type": "application/json; charset=UTF-8"
    }
  })
  .then((response) => response.json())
  .then((json) => {
    if(eltype==1){
      for(let x in json){
        dashboard+='<input type="checkbox" name="'+elname+'" id="'+json[x]["id"]+'" value="'+json[x]["id"]+'"><label for="'+json[x]["name"]+'">&nbsp;'+json[x]["name"]+'</label><br>'
      }
    }else if(eltype==2){
      for(let x in json){
        dashboard+='<option value="'+json[x]["id"]+'">'+json[x]['name']+'</option>'
      }
    }
    document.getElementById(elbox).innerHTML = dashboard;
  });
}
var getConfig = function(){
  var conf = fetch("/get/configuration",{
    method: "GET",
    headers: {
      "Content-type": "application/json; charset=UTF-8"
    }
  })
  .then((response) => response.json())
  .then((json) => {
    json = JSON.stringify(json);
    json = json.slice(1,-1);
    json = JSON.parse(json);
    for(let x in json){
      if(x=='ldap_url')document.getElementById('ldap_url').value = json[x]
      if(x=='ldap_dn')document.getElementById('ldap_dn').value = json[x]
      if(x=='ldap_admin')document.getElementById('ldap_admin').value = json[x]
      if(x=='pbi_url')document.getElementById('pbi_url').value = json[x]
      if(x=='pbi_login')document.getElementById('pbi_login').value = json[x]
    }
  })
}
var getRule = function(report_id,report_name,group){
  var rule = fetch("/fetch/rule", {
    method: "POST",
    body: JSON.stringify({
      report_id: report_id,
      report_name: report_name,
      group: group
    }),
    headers: {
      "Content-type": "application/json; charset=UTF-8"
    }
  })
  .then((response) => response.json())
  .then((json) => {
    var report = document.getElementById("report-container");
    var current = report.innerHTML;
    var temp = '';
    temp+=current;
    for(let x in json){
      temp+=json[x]
    }
    report.innerHTML = temp;
  })
}
var getRuleRls = function(param){
  var rls = fetch("/fetch/rule/rls", {
    method: "POST",
    body: JSON.stringify({
      dataset: param
    }),
    headers: {
      "Content-type": "application/json; charset=UTF-8"
    }
  })
  .then((response) => response.json())
  .then((json) => {
    var content = document.getElementById("extra-container")
    for(let x in json){
      if(x=='result')content.innerHTML = json[x]
      if(x=='counter'){
        for(j=0;j<json[x];j++){
          getLdapGroups('group_list_rls_'+j);
        }
      }
    }
  })
}
var getUserGroup = function(group,exclude_item){
  var listmember = document.getElementById("group_member")
  var user = fetch("/get/ldap/usergroup", {
    method: "POST",
    body: JSON.stringify({
      group: group,
      exclude_item: exclude_item
    }),
    headers: {
      "Content-type": "application/json; charset=UTF-8"
    }
  })
  .then((response) => response.json())
  .then((json) => {
    let list = '';
    for(let x in json){
      list+='<option value="'+json[x]+'">'+json[x]+'</option>'
    }
    listmember.innerHTML = list;
    getLdapUsers('group_user',json)
  })
}
var getProf = function(param){
  var result = fetch("/profile/param", {
    method: "POST",
    body: JSON.stringify({
      param: param 
    }),
    headers: {
      "Content-type": "application/json; charset=UTF-8"
    }
  })
  .then((response) => response.json())
  .then((json) => {
    cboxes = document.getElementsByName("report_profile");
    for(var k=0;k<cboxes.length;k++){
      cboxes[k].checked = false;
    }
  if(json.length>0){
    json = JSON.stringify(json);
    json = json.slice(1,-1);
    json = JSON.parse(json);
    for(let x in json){
    if(x=='is_admin'){
      document.getElementById('isadmin').checked=json[x];
    }else if(x=='dashboard'){
      if(typeof(json['dashboard'])=='object'){
        for(let j in json['dashboard']){
          for(var l=0;l<cboxes.length;l++){
            if(cboxes[l].value==json['dashboard'][j]){
              cboxes[l].checked = true;
            }
          }
        }
      }else{
        for(var l=0;l<cboxes.length;l++){
          if(cboxes[l].value==json['dashboard']){
            cboxes[l].checked = true;
          }
        }
      }
    }
  }
}}
)}
var getUser = function(param){
  var result = fetch("/user/param", {
    method: "POST",
    body: JSON.stringify({
      param: param 
    }),
    headers: {
      "Content-type": "application/json; charset=UTF-8"
    }
  })
  .then((response) => response.json())
  .then((json) => {
    cboxes = document.getElementsByName("report_user");
    for(var k=0;k<cboxes.length;k++){
      cboxes[k].checked = false;
    }
  if(json.length>0){
    json = JSON.stringify(json);
    json = json.slice(1,-1);
    json = JSON.parse(json);
    for(let x in json){
      if(x=='dashboard'){
        if(typeof(json['dashboard'])=='object'){
          for(let j in json['dashboard']){
            for(var l=0;l<cboxes.length;l++){
              if(cboxes[l].value==json['dashboard'][j]){
                cboxes[l].checked = true;
              }
            }
          }
        }else{
          for(var l=0;l<cboxes.length;l++){
            if(cboxes[l].value==json['dashboard']){
              cboxes[l].checked = true;
            }
          }
        }
      }
    }
  }}
)}
var getLdapUsers = function(el,exclude_user){
  var listuser = document.getElementById(el)
  var users = fetch("/get/ldap/users", {
    method: "POST",
    body: JSON.stringify({
      exclude_user: exclude_user
    }),
    headers: {
      "Content-type": "application/json; charset=UTF-8"
    }
  })
  .then((response) => response.json())
  .then((json) => {
    let list = '';
    for(let x in json){
      list+='<option value="'+json[x]+'">'+json[x]+'</option>'
    }
    listuser.innerHTML = list;
  })
}
var getLdapGroups = function(el){
  var grouplist = document.getElementById(el);
  var groups = fetch("/get/ldap/groups", {
    method: "GET",
    headers: {
      "Content-type": "application/json; charset=UTF-8"
    }
  })
  .then((response) => response.json())
  .then((json) => {
    let list = '';
    for(let x in json){
      list+='<option value="'+json[x]+'">'+json[x]+'</option>'
    }
    grouplist.innerHTML = list;
  })
}
var manageLdap = function(){
contents = '<div class="nav nav-tabs" id="nav-tab" role="tablist" style="margin-top:5px"><button class="nav-link active" id="nav-user-tab" data-bs-toggle="tab" data-bs-target="#nav-user" type="button" role="tab" aria-controls="nav-user" aria-selected="true">LDAP User</button><button class="nav-link" id="nav-group-tab" data-bs-toggle="tab" data-bs-target="#nav-group" type="button" role="tab" aria-controls="nav-group" aria-selected="false">LDAP Group</button></div><div class="tab-content" id="nav-tabContent"><div class="tab-pane fade show active" id="nav-user" role="tabpanel" aria-labelledby="nav-user-tab" tabindex="0"><div class="card text-bg-light mb-3"><div class="card-body"><form action="/ldap/create/user" method="POST" class="needs-validation"><label for="firstname">First Name</label>&nbsp;<input type="textbox" id="firstname" name="firstname" style="margin-bottom:12px" autofocus required><div class="invalid-feedback">First name cannot empty</div>&nbsp;&nbsp;&nbsp;<label for="lastname">Last Name</label>&nbsp;<input type="textbox" id="lastname" name="lastname" style="margin-bottom:12px" required><div class="invalid-feedback">Last name cannot empty</div><br><label for="username">Username</label>&nbsp;&nbsp;<input type="textbox" id="username" name="username" style="margin-bottom:12px" required><div class="invalid-feedback">Username cannot empty</div>&nbsp;&nbsp;&nbsp;<label for="email" required>Email</label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<input type="email" id="email" name="email" style="margin-bottom:12px" required><div class="invalid-feedback">Email cannot empty</div><br><label for="password">Password</label>&nbsp;&nbsp;&nbsp;<input type="password" id="password" name="password" style="margin-bottom:12px" required><div class="invalid-feedback">Password cannot empty</div><br><input type="submit" value="Create User" class="btn btn-primary"></form></div></div></div><div class="tab-pane fade" id="nav-group" role="tabpanel" aria-labelledby="nav-group-tab" tabindex="0"><div class="card text-bg-light mb-3"><div class="card-body"><form action="/ldap/create/group" method="POST" class="needs-validation"><label for="groupname">Group Name</label>&nbsp;<input type="textbox" id="groupname" name="groupname" style="margin-bottom:12px" autofocus required><div class="invalid-feedback">Group name cannot empty</div><br><input type="submit" value="Create Group" class="btn btn-primary"></form><br><form action="/ldap/manage/group" method="POST"><label for="group_list_ldap">Select Group </label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<select id="group_list_ldap" name="group_list_ldap" onchange="getUserGroup(this.value,null)">`
maincontent+= `</select><br><div class="flexcontainer"><div><b>Member</b><br><select id="group_member" name="group_member" class="form-select" size="7"></select></div><div style="text-align:center"><br><br><input type="button" value="Add" onclick="AddUser()" class="btn btn-primary"><br><br><input type="button" value="Remove" onclick="RemoveUser()" class="btn btn-primary"></div><div><b>LDAP User</b><br><select id="group_user" name="group_user" class="form-select" size="7"></select></div></div><br><input type="hidden" id="ldap_mode" name="ldap_mode"><input type="hidden" id="ldap_user" name="ldap_user"><input type="submit" value="Save" class="btn btn-primary"></form></div></div></div></div>';
content.innerHTML = contents;
getLdapUsers('group_user',null);
getLdapGroups('group_list_ldap');
getRuleRls(null);
content.style.height = '700px';
}
var manageRls = function(){
contents = '<div class="card text-bg-light mb-3" style="margin-top:5px"><div class="card-header"><b>Manage Row Level Security</b></div><div class="card-body"><form action="/manage/rls/create" method="POST" class="needs-validation"><label for="rulename">Rule Name</label>&nbsp;<input type="textbox" id="rulename" name="rulename" style="margin-bottom:12px" required><div class="invalid-feedback">Rule name cannot empty</div><br /><label for="dataset">Dataset </label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<select id="dataset" name="dataset" onchange="getRuleRls(this.value)">`
maincontent+=`</select>&nbsp;&nbsp;&nbsp;<label for="column">Column </label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<select id="column" name="column" onchange="javascript:void()"><option value="WILAYAH">WILAYAH</option><option value="REGIONAL">REGIONAL</option><option value="AREA">AREA</option><option value="CABANG">CABANG</option></select>&nbsp;&nbsp;&nbsp;<label for="operator">Operator </label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<select id="operator" name="operator" onchange="javascript:void()"><option value="=">=</option><option value="IN">IN</option></select>&nbsp;&nbsp;&nbsp;<label for="clause">Clause</label>&nbsp;<input type="textbox" id="clause" name="clause" required><div class="invalid-feedback">Clause cannot empty</div><br><br><div class="flexcontainer"><div><br><br><br><label for="group_list_rls">Select Group </label>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<select id="group_list_rls" name="group_list_rls" onchange="javascript:void()"></select></div><div><br><input type="button" value="Add" onclick="AddGroup(group_affected,group_list_rls)" class="btn btn-primary"><br><br><input type="button" value="Remove" onclick="RemoveGroup(group_affected)" class="btn btn-primary"></div><div><b>Group Affected</b><br><select id="group_affected" name="group_affected" class="form-select" size="7"></select><br></div></div><input type="hidden" id="affected" name="affected"><input type="submit" value="Create Rule" class="btn btn-primary"></form></div></div>'
content.innerHTML = contents;
getLdapGroups('group_list_rls');
getRuleRls(null);
getDashboard(2,'elrls','dataset')
content.style.height = '400px';
}
var AddUser = function(){
  const elinput = document.getElementById("group_user")
  const eloutput = document.getElementById("group_member")
  var temp = eloutput.innerHTML
  var newitem = elinput.options[elinput.selectedIndex].text
  if(newitem){
    temp+='<option value='+newitem+' selected>'+newitem+'</option>'
    eloutput.innerHTML = temp
    document.getElementById("ldap_mode").value = 1;
    var groups = []
    for(i=0;i<eloutput.length;i++){
      groups.push(eloutput.options[i].value)
    }
    getLdapUsers('group_user',groups);
  }
}
var RemoveUser = function(){
  const elinput = document.getElementById("group_member")
  const eloutput = document.getElementById("group_user")
  var olditem = elinput.options[elinput.selectedIndex].text
  if(olditem){
    document.getElementById("ldap_mode").value = 2;
    document.getElementById("ldap_user").value = olditem;
    var groups = [];
    var groupsout = [];
    var temp = '';
    var tempout = '';
    for(x=0;x<elinput.length;x++){
      groups.push(elinput.options[x].text)
    }
    for(x=0;x<eloutput.length;x++){
      groupsout.push(eloutput.options[x].text)
    }
    groupsout.push(olditem);
    const idx = groups.indexOf(olditem)
    if(idx>-1)groups.splice(idx,1)
    for(let x in groups){
      temp+='<option value='+groups[x]+'>'+groups[x]+'</option>'
    }
    for(let x in groupsout){
      tempout+='<option value='+groupsout[x]+'>'+groupsout[x]+'</option>'
    }
    elinput.innerHTML = temp;
    eloutput.innerHTML = tempout;
    //getUserGroup(document.getElementById("group_list_ldap").value,olditem)
  }
}
var AddGroup = function(elo,eli,aff){
  const eloutput = document.getElementById(elo)==null?document.getElementById("group_affected"):document.getElementById(elo);
  const elinput = document.getElementById(eli)==null?document.getElementById("group_list_rls"):document.getElementById(eli);
  const affected = document.getElementById(aff)==null?document.getElementById("affected"):document.getElementById(aff);
  var groups = []
  for(i=0;i<eloutput.length;i++){
    groups.push(eloutput.options[i].value)
  }
  var temp = eloutput.innerHTML
  var newitem = elinput.options[elinput.selectedIndex].text
  if(newitem){
    temp+='<option value='+newitem+'>'+newitem+'</option>'
    eloutput.innerHTML = temp
    groups.push(newitem)
    affected.value = groups
  }
}
var RemoveGroup = function(el,aff){
  const elinput = document.getElementById(el)==null?document.getElementById("group_affected"):document.getElementById(el);
  const affected = document.getElementById(aff)==null?document.getElementById("affected"):document.getElementById(aff);
  var groups = [];
  var temp = '';
  var olditem = elinput.options[elinput.selectedIndex].text
  if(olditem){
    for(x=0;x<elinput.length;x++){
      groups.push(elinput.options[x].text)
    }
    const idx = groups.indexOf(olditem)
    if(idx>-1)groups.splice(idx,1)
    for(let x in groups){
      temp+='<option value='+groups[x]+'>'+groups[x]+'</option>'
    }
    elinput.innerHTML = temp;
    affected.value = groups;
  }
}
var reportChange = function(group,dataset,kolom,operator,clause) {
  let arg_report = '';
  let reportUrl = \`${pbi_report_url}\`
  reportUrl = reportUrl + "/"
  reportUrl = reportUrl + dataset
  reportUrl = reportUrl + "?rs:embed=true&filterPaneEnabled=false&pageNavigation=false"
  reportUrl = reportUrl + "&filter="
  if(operator=="="){
    operator = "eq"
    arg_report+=dataset + "/" + kolom + " " + operator + " " + clause
  }else{
    operator = 'in'
    clause = clause.split(',')
    arg_report+=dataset + "/" + kolom + " " + operator + " ("
    for(x=0;x<clause.length;x++){
      arg_report+=clause[x].replaceAll("_"," ")
      if(x<clause.length-1)arg_report+=', '
    }
    arg_report+=")"
  }
  reportUrl = reportUrl + arg_report
  content.innerHTML = '<div class="panel panelcontainer"><iframe title="report" src="'+reportUrl+'" frameborder="0" allowFullScreen="true"></iframe><div id="itemshield"></div><div style="clear:both;"></div></div>';
}`

maincontent+=`;
</script>
<script>
	(function () {
		'use strict'
		const forms = document.querySelectorAll('.needs-validation')
		Array.from(forms)
			.forEach(function (form) {
			form.addEventListener('submit', function (event) {
				if (!form.checkValidity()) {
					event.preventDefault()
					event.stopPropagation()
				}
			form.classList.add('was-validated')}, false)
			})
			})()
			</script>
</body>
</html>`;
return maincontent;
}

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});