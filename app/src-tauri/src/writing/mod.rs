//! Backend for the Writing workspace: headless AI runs and PDF export.

pub mod ai_runner;
pub mod engines;
pub mod models;
pub mod print_pdf;

pub use ai_runner::{WritingAiEvent, WritingAiRunRequest, WritingAiRunner};
pub use print_pdf::PrintJobs;
