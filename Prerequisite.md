# Setup NodeJS

Download nodejs from https://nodejs.org/en/download and run the installer

# Setup MongoDB

Download mongodb community version from https://www.mongodb.com/try/download/community and run the installer
don't forget to install mongodb client Compass for managing mongodb

1. Open mongodb compass and create connection to mongodb server

![mongodb_connection](https://github.com/renosuprastiyo/pobi-powerbi-userinterface/blob/main/resources/mongodb_connection.png)

2. Create mongodb database

![mongodb_createdb](https://github.com/renosuprastiyo/pobi-powerbi-userinterface/blob/main/resources/mongodb_createdb.png)

Save mongodb url and database name for future use in .env file

# Setup LDAP Server

We will be using docker for this so ensure you have installed docker desktop from https://www.docker.com/ and run the installer
1. Create docker network

docker network create --subnet=192.20.0.0/16 pobinet

2. Run ldap server container

docker run -d --net pobinet --ip 192.20.1.70 --hostname pobi-ldap --name pobi-ldap -e LDAP_ORGANISATION=YOURORGANIZATION -e LDAP_DOMAIN=YOURORGANIZATION.org -e LDAP_ADMIN_PASSWORD=admin -e LDAP_CONFIG_PASSWORD=config -e LDAP_RFC2307BIS_SCHEMA=true -e LDAP_REMOVE_CONFIG_AFTER_SETUP=true -e LDAP_TLS_VERIFY_CLIENT=never -v ./storage/ldap_db:/var/lib/ldap -v ./storage/ldap_config:/etc/ldap/slapd.d -it osixia/openldap:latest

3. Run ldap ui container(for manage ldap)

docker run -d --net pobinet --ip 192.20.1.71 --hostname pobi-ldapui --add-host pobi-ldap:192.20.1.70 --name pobi-ldapui -e LDAP_URI=ldap://pobi-ldap -e LDAP_BASE_DN=dc=YOURORGANIZATION,dc=org -e LDAP_REQUIRE_STARTTLS=FALSE -e LDAP_ADMIN_BIND_DN=cn=admin,dc=YOURORGANIZATION,dc=org -e LDAP_ADMIN_BIND_PWD=admin -e LDAP_IGNORE_CERT_ERRORS=true -e NO_HTTPS=TRUE -e PASSWORD_HASH=SSHA -e ACCEPT_WEAK_PASSWORDS=TRUE -e SERVER_HOSTNAME=pobi-ldapui:18070 -p 18070:80 -it wheelybird/ldap-user-manager:latest

4. View your running container

docker ps

Save ldap_url, ldap dn(distinguished name), ldap admin user and ldap admin password for future use in .env file

# Setup Power BI Report Server(On-prem)

Download Power BI Report Server from https://www.microsoft.com/en-us/power-platform/products/power-bi/report-server and run the installer you can installed it on windows server machine or regular windows machine

