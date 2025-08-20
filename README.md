# POBI - Power BI Interface

POBI is backend application to serve power bi dashboard for hundreds to thousands users used in on-prem condition.

With some feature such as :
1. RBAC(Role based access control) using LDAP
2. Dashboard Management(Upload your .pbix dashboard)
3. LDAP Management
4. Rule based RLS(Row Level Security) Management

Build on MEN(MongoDB, ExpressJS, NodeJS) stack and bootstrap css with the help from LDAP, Power BI Report Server and Nginx.

Here some picture from application

Login Page
![login_page](https://github.com/renosuprastiyo/pobi-powerbi-userinterface/blob/main/resources/login_page.png)

View Dashboard
![dashboard_page](https://github.com/renosuprastiyo/pobi-powerbi-userinterface/blob/main/resources/dashboard_page.png)
![view_dashboard](https://github.com/renosuprastiyo/pobi-powerbi-userinterface/blob/main/resources/view_dashboard.png)

Manage Dashboard

![manage_dashboard](https://github.com/renosuprastiyo/pobi-powerbi-userinterface/blob/main/resources/manage_dashboard.png)

Manage LDAP Group

![manage_ldap_group](https://github.com/renosuprastiyo/pobi-powerbi-userinterface/blob/main/resources/manage_ldap_group.png)

Manage RLS

![manage_rls](https://github.com/renosuprastiyo/pobi-powerbi-userinterface/blob/main/resources/manage_rls.png)
![manage_rls_view](https://github.com/renosuprastiyo/pobi-powerbi-userinterface/blob/main/resources/manage_rls_view.png)

How to Use it

1. Clone this repository
2. Follow instruction in [Prerequisite.md](https://github.com/renosuprastiyo/pobi-powerbi-userinterface/blob/main/Prerequisite.md) to setup NodeJS, MongoDB, LDAP Server, Power BI Report Server and Nginx
3. cd backend
4. rename .env.example to .env and adjust it's content using your settings
5. npm start
6. login with username adminpobi and password admin
7. upload your first dashboard to powerbi report server
8. assign dashboard to your profile/group in manage dashboard page
9. create row level security rule for your profile/group
10. ready to view your dashboard

Cheers!!
