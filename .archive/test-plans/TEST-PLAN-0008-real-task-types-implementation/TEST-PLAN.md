# QA Plan: Real Task Types Implementation

## Overview
The goal of this test plan is to verify that the `TaskTypeService` fully utilizes the database and NATS event bus.

## Scenarios

### Scenario 1: Retreiving an existing Task Type
**Given** the database contains an existing Task Type record
**When** the user calls `getTaskType` with the record's ID
**Then** the service should return the details associated with the Task Type cleanly

### Scenario 2: Creating a new Task Type
**Given** a valid authentication and authorization state
**When** the user calls `createTaskType` with valid parameters (`name`, `orgId`, `projectId`)
**Then** the system should insert the Task Type into the active database
**And** publish the `domain.task_type.created` NATS event

### Scenario 3: Not Found Errors
**Given** a non-existent task type id
**When** `getTaskType` is called
**Then** an appropriate `NotFound` or `Error` detail is thrown.
