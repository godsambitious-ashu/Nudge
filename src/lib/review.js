const { exec } = require('@actions/exec');
const path = require('path');
const fs = require('fs').promises;
const github = require('@actions/github');

class ReviewProcessor {
  constructor() {
    this.octokit = github.getOctokit(process.env.GITHUB_TOKEN);
    
    this.includePatterns = (process.env.INCLUDE_PATTERNS || "")
      .split(",")
      .map((pattern) => pattern.trim())
      .filter((pattern) => pattern.length > 0);

    this.excludePatterns = (process.env.EXCLUDE_PATTERNS || "")
      .split(",")
      .map((pattern) => pattern.trim())
      .filter((pattern) => pattern.length > 0);
      
    this.context = {
      repo: {
        owner: process.env.GITHUB_REPOSITORY.split('/')[0],
        repo: process.env.GITHUB_REPOSITORY.split('/')[1]
      },
      issue: {
        number: github.context.issue.number
      },
      payload: {
        pull_request: {
          head: { sha: process.env.GITHUB_SHA },
          base: { ref: process.env.GITHUB_BASE_REF }
        }
      }
    };
  }
  async getChangedFiles() {
    const allFiles = [];
    let page = 1;

    while (true) {
      const response = await this.octokit.rest.pulls.listFiles({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        pull_number: this.context.issue.number,
        per_page: 100,
        page: page
      });

      if (!response || response.data.length === 0) break;
  
      const validFiles = response.data.map(file => ({
        filename: file.filename,
        patch: file.patch
      }));
  
      const filteredFiles = this.filterFiles(validFiles);      
      allFiles.push(...filteredFiles);
      page++;
    }
  
    return allFiles;
  }
  
  filterFiles(files) {
    if (!files || files.length === 0) {
      return [];
    }
    
    // If no patterns are specified, only apply exclude filtering
    if (this.includePatterns.length === 0) {
      return files.filter(file => !this.matchesAnyPattern(file.filename, this.excludePatterns));
    }
    
    // Apply both include and exclude filtering in a single pass
    return files.filter(file => 
      this.matchesAnyPattern(file.filename, this.includePatterns) && 
      !this.matchesAnyPattern(file.filename, this.excludePatterns)
    );
  }
  
  matchesAnyPattern(filename, patterns) {
    return patterns.some(pattern => filename.includes(pattern));
  }
    
  createBatches(files) {
    const batchSize = Math.min(Math.max(Math.floor(files.length / 5), 5), 5);
    return Array.from({ length: Math.ceil(files.length / batchSize) }, (_, i) =>
      files.slice(i * batchSize, (i + 1) * batchSize)
    );
  }

  async processBatch(files) {
    
    // Generate diff for all files
    let diffString = await this.getDiffForFiles(files);
    
    // Generate review with targeted file changes
    const review = await this.generateReview(diffString);
  
    return review;
  }

  async getDiffForFiles(files) {
    let diffOutput = '';
    
    await exec('git', [
      'diff',
      '-U3',
      `origin/${this.context.payload.pull_request.base.ref}...HEAD`,
      '--',
      ...files.map(f => f.filename)
    ], {
      listeners: {
        stdout: (data) => {
          diffOutput += data.toString();
        }
      }
    });
  
    return diffOutput;
  }

  async generateReview(diffString) {
    const guidelinesPath = path.join(process.env.GITHUB_WORKSPACE, 'PR-Review-Guidelines.md');
    const guidelines = await fs.readFile(guidelinesPath, 'utf8');
    let reviewOutput = '';
    
    console.log('Starting Cody review with guidelines from:', guidelinesPath);
    console.log('Diff string length:', diffString.length);
  
    await exec('cody', [
      'chat', 
      '--stdin', 
      '-m', guidelines, 
      '--access-token', process.env.SRC_ACCESS_TOKEN,
      '--endpoint', process.env.SRC_ENDPOINT || 'https://sourcegraph.com'], {
      input: diffString,
      listeners: {
        stdout: (data) => {
          console.log('Cody output:', data.toString());
          reviewOutput += data.toString();
        },
        stderr: (data) => {
          console.log('Cody error:', data.toString());
        }
      }
    });
  
    console.log('Review generation completed');
    return reviewOutput || 'No review feedback generated';
  }
  
  
  async createInlineComments(feedback) {
    const feedbackArray = Array.isArray(feedback) ? feedback : [feedback];
    
    // Get the latest commit SHA from the PR
    const { data: pullRequest } = await this.octokit.rest.pulls.get({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      pull_number: this.context.issue.number
    });
  
    const headSha = pullRequest.head.sha;
  
    for (const review of feedbackArray) {
      const lines = review.toString().split('\n');
      
      for (const line of lines) {
        try {
          const match = line.match(/^File: ([^,]+), Line\(s\): ([^,]+), Feedback: (.+)$/);
          if (match) {
            const [_, filename, lineRange, feedbackText] = match;
            
            await this.octokit.rest.pulls.createReviewComment({
              owner: this.context.repo.owner,
              repo: this.context.repo.repo,
              pull_number: this.context.issue.number,
              body: feedbackText,
              path: filename,
              line: parseInt(lineRange),
              commit_id: headSha
            });
            console.log(`Successfully created comment for ${filename} at line ${lineRange}`);
          }
        } catch (error) {
          console.log(`Skipping comment creation due to error: ${error.message}`);
          console.log(`Failed line: ${line}`);
          continue;
        }
      }
    }
  }
}

module.exports = { ReviewProcessor };
