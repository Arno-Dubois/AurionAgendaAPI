# Aurion Agenda API

FR : https://github.com/Arno-Dubois/AurionAgendaAPI/blob/develop/README_FR.md

## Overview

This API provides a way to programmatically access and retrieve agenda information from Aurion, an academic platform. It addresses the challenges of Aurion's authentication and data retrieval processes, allowing developers to easily integrate Aurion agenda data into their applications.

## Features

-   Fetches and parses Aurion agenda data.
-   Handles Aurion's complex redirection and authentication.
-   Provides a simple interface for retrieving events for a given date range.

## Challenges with Aurion

Accessing data from Aurion programmatically presents several challenges:

-   **Redirection:** Aurion requires redirection when changing pages, with dynamically generated parameters.
-   **Dynamic Parameters:** Key parameters like `ViewState` and `IDTS` change frequently and are embedded within the HTML content. `ViewState` changes with every page, and `IDTS` varies monthly.
-   **Header and Body Requirements:** Specific header (e.g., `Content-Type`) and body parameters (`javax` parameters) are required for most requests.
-   **Complex Navigation:** Accessing specific data requires navigating through multiple menus and sub-menus.

Refer to `url.md` for pre-made requests, or record all requests and responses
while using Aurion normally to understand the process.

### Input/Output Specifications

#### Input

The API requires a username and password for authentication. To fetch agenda data, the following parameters are special:

-   `idt_start`: A Unix timestamp (in milliseconds) representing the start date.
-   `idt_end`: A Unix timestamp (in milliseconds) representing the end date. The API will retrieve events up to the end of the day specified by this timestamp.

#### Output

The API returns a list of agenda events. Each event contains the following information:

-   **Title:** A concatenated string containing classroom, description, discipline, event type (e.g., TD, PROJECT, TP), and instructors, separated by line breaks. A trailing whitespace may be present.
-   **Start Time:** In ISO 8601 format. (YYYY-MM-DDTHH:mm:ss.sssZ)
-   **End Time:** In ISO 8601 format. (YYYY-MM-DDTHH:mm:ss.sssZ)

## Getting Started

### Prerequisites

-   Node.js (version X or higher)
-   npm or yarn

### Installation
