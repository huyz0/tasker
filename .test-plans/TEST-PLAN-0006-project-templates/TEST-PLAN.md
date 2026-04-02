# Test Plan for Project Templates
- Given a valid project template, When creating a new project with an owner, Then the project is securely bound to the template and the organization.
- Given an invalid project assignment, When requested, Then the API aggressively blocks the transaction with an HTTP Problem Detail.
