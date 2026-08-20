---
tags: [hub]
---

# Home

This vault visualizes the **School & College ERP** repository, whose core idea is **one specification, two runtimes**: the same domain rules — grading, student identifiers, attendance, fees — are implemented once as a production C#/SQL Server stack and once again as a client-side browser twin for a live GitHub Pages demo, both derived from the same requirements specification. Every note below is a node in that graph; open Graph View to see how the spec fans out into two independent, verified implementations.

## Overview
- [[School College ERP]]
- [[Repository Layout]]
- [[Verification & Testing]]
- [[Known Limits]]

## Runtimes
- [[Domain Specification]]
- [[Domain Library]]
- [[Production App]]
- [[Browser Twin]]
- [[SQL Schema]]

## Cross-Cutting Rules
- [[Grading Engine]]
- [[Student Identifiers]]
- [[Attendance Modes]]
- [[Module Switches]]
- [[Fee Ledger]]
- [[Roles & Permissions]]
- [[Bangla Language Support]]
- [[Time Machine]]
- [[Write Overlay]]
- [[Backups & Disaster Recovery]]
- [[Authentication & Security]]

## Feature Modules
- [[Admissions Module]]
- [[Student Profiles Module]]
- [[Attendance Module]]
- [[Exams & Results Module]]
- [[Class Routine Module]]
- [[Fees & Accounts Module]]
- [[Notice Board Module]]
- [[Parent Portal Module]]
- [[Library Module]]
- [[Transport Module]]
- [[HR & Payroll Module]]
- [[Hostel Module]]
- [[Settings & System Health]]

## Inventories
- [[Controllers]]
- [[Services]]
- [[Core Browser Modules]]
- [[Screen Modules]]
- [[Database Tables]]
- [[Stored Procedures]]

## Requirements Spec
- [[Requirements Overview]] — fans out to 18 numbered sections, §1 through §18, one note each.

## How to use this vault

Open the `obsidian-vault` folder in Obsidian via **File → Open folder as vault**, then open **Graph View** (Cmd/Ctrl+G) to see the whole repo as a connected graph. Optionally color-group the nodes in **Graph View → Groups** using queries like `tag:#module`, `tag:#rule`, `tag:#runtime`, `tag:#requirement`, `tag:#inventory`, `tag:#overview`, and `tag:#hub` so each layer of the architecture gets its own color.
