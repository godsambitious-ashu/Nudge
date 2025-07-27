const { ReviewProcessor } = require('../src/lib/review');
const github = require('@actions/github');
const { exec } = require('@actions/exec');
const fs = require('fs').promises;
const path = require('path');

// Mock external dependencies
jest.mock('@actions/exec', () => ({
  exec: jest.fn()
}));
jest.mock('@actions/github');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn()
  }
}));

describe('ReviewProcessor', () => {
  let processor;
  let originalEnv;

  // Setup environment variables and mocks before each test
  beforeEach(() => {
    originalEnv = process.env;
    process.env = {
      ...process.env,
      GITHUB_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'testowner/testrepo',
      GITHUB_SHA: 'test-sha',
      GITHUB_BASE_REF: 'main',
      INCLUDE_PATTERNS: 'src/,test/',
      EXCLUDE_PATTERNS: 'node_modules/,dist/',
      GITHUB_WORKSPACE: '/workspace',
      SRC_ACCESS_TOKEN: 'test-src-token'
    };

    // Mock GitHub context and Octokit
    github.context = {
      issue: { number: 123 }
    };
    
    const mockOctokit = {
      rest: {
        pulls: {
          listFiles: jest.fn(),
          get: jest.fn(),
          createReviewComment: jest.fn()
        }
      }
    };
    
    github.getOctokit.mockReturnValue(mockOctokit);
    
    processor = new ReviewProcessor();
  });

  // Restore original environment after each test
  afterEach(() => {
    process.env = originalEnv;
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with correct configuration from environment variables', () => {
      expect(processor.includePatterns).toEqual(['src/', 'test/']);
      expect(processor.excludePatterns).toEqual(['node_modules/', 'dist/']);
      expect(processor.context.repo).toEqual({
        owner: 'testowner',
        repo: 'testrepo'
      });
      expect(processor.context.issue.number).toBe(123);
      expect(processor.context.payload.pull_request.head.sha).toBe('test-sha');
      expect(processor.context.payload.pull_request.base.ref).toBe('main');
    });

    test('should handle empty include/exclude patterns', () => {
      process.env.INCLUDE_PATTERNS = '';
      process.env.EXCLUDE_PATTERNS = '';
      
      const emptyProcessor = new ReviewProcessor();
      
      expect(emptyProcessor.includePatterns).toEqual([]);
      expect(emptyProcessor.excludePatterns).toEqual([]);
    });

    test('should handle patterns with spaces', () => {
      process.env.INCLUDE_PATTERNS = 'src/ , test/ , lib/';
      
      const processor = new ReviewProcessor();
      
      expect(processor.includePatterns).toEqual(['src/', 'test/', 'lib/']);
    });
  });

  describe('filterFiles', () => {
    test('should filter files based on include patterns', () => {
      const files = [
        { filename: 'src/file1.js', patch: 'patch1' },
        { filename: 'test/file2.js', patch: 'patch2' },
        { filename: 'other/file3.js', patch: 'patch3' }
      ];
      
      const filtered = processor.filterFiles(files);
      
      expect(filtered).toHaveLength(2);
      expect(filtered).toContainEqual({ filename: 'src/file1.js', patch: 'patch1' });
      expect(filtered).toContainEqual({ filename: 'test/file2.js', patch: 'patch2' });
    });

    test('should filter out files based on exclude patterns', () => {
      const files = [
        { filename: 'src/file1.js', patch: 'patch1' },
        { filename: 'node_modules/file2.js', patch: 'patch2' },
        { filename: 'dist/file3.js', patch: 'patch3' }
      ];
      
      const filtered = processor.filterFiles(files);
      
      expect(filtered).toHaveLength(1);
      expect(filtered).toContainEqual({ filename: 'src/file1.js', patch: 'patch1' });
    });

    test('should return all files when no include patterns provided', () => {
      processor.includePatterns = [];
      
      const files = [
        { filename: 'src/file1.js', patch: 'patch1' },
        { filename: 'lib/file2.js', patch: 'patch2' }
      ];
      
      const filtered = processor.filterFiles(files);
      
      expect(filtered).toHaveLength(2);
    });
  });

  describe('createBatches', () => {
    test('should create batches of files with appropriate size', () => {
      const files = Array.from({ length: 20 }, (_, i) => ({ 
        filename: `file${i}.js`, 
        patch: `patch${i}` 
      }));
      
      const batches = processor.createBatches(files);
      
      expect(batches).toHaveLength(4); // 20 files / 5 = 4 batches
      expect(batches[0]).toHaveLength(5);
      expect(batches[3]).toHaveLength(5);
    });

    test('should handle small number of files', () => {
      const files = Array.from({ length: 3 }, (_, i) => ({ 
        filename: `file${i}.js`, 
        patch: `patch${i}` 
      }));
      
      const batches = processor.createBatches(files);
      
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(3);
    });
  });

  describe('getChangedFiles', () => {
    test('should fetch and process all changed files from GitHub API', async () => {
      const mockListFiles = jest.fn();
      processor.octokit.rest.pulls.listFiles = mockListFiles;
      
      // Mock first page of results
      mockListFiles.mockResolvedValueOnce({
        data: [
          { filename: 'src/file1.js', patch: 'patch1' },
          { filename: 'src/file2.js', patch: 'patch2' }
        ]
      });
      
      // Mock second page of results
      mockListFiles.mockResolvedValueOnce({
        data: [
          { filename: 'src/file3.js', patch: 'patch3' },
          { filename: 'node_modules/file4.js', patch: 'patch4' }
        ]
      });
      
      // Mock empty third page (end of results)
      mockListFiles.mockResolvedValueOnce({ data: [] });
      
      const files = await processor.getChangedFiles();
      
      expect(mockListFiles).toHaveBeenCalledTimes(3);
      expect(files).toHaveLength(3); // 3 matching files - 1 excluded file
      expect(files).toContainEqual({ filename: 'src/file1.js', patch: 'patch1' });
      expect(files).toContainEqual({ filename: 'src/file2.js', patch: 'patch2' });
    });
  });

  describe('getDiffForFiles', () => {
    test('should execute git diff command with correct parameters', async () => {
      const mockExecImplementation = (command, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout('mock diff output');
        }
        return Promise.resolve(0);
      };
      
      exec.mockImplementation(mockExecImplementation);
      
      const files = [
        { filename: 'src/file1.js' },
        { filename: 'src/file2.js' }
      ];
      
      const diff = await processor.getDiffForFiles(files);
      
      expect(exec).toHaveBeenCalledWith(
        'git',
        [
          'diff',
          '-U3',
          'origin/main...HEAD',
          '--',
          'src/file1.js',
          'src/file2.js'
        ],
        expect.objectContaining({
          listeners: expect.any(Object)
        })
      );
      
      expect(diff).toBe('mock diff output');
    });
  });

  describe('generateReview', () => {
    test('should call Cody with proper parameters and return review output', async () => {
      fs.readFile.mockResolvedValue('# Review Guidelines');
      
      const mockExecImplementation = (command, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout('AI review feedback');
        }
        return Promise.resolve(0);
      };
      
      exec.mockImplementation(mockExecImplementation);
      
      const review = await processor.generateReview('diff string');
      
      expect(fs.readFile).toHaveBeenCalledWith('/workspace/PR-Review-Guidelines.md', 'utf8');
      
      expect(exec).toHaveBeenCalledWith(
        'cody',
        [
          'chat',
          '--stdin',
          '-m',
          '# Review Guidelines',
          '--access-token',
          'test-src-token',
          '--endpoint',
          'https://sourcegraph.com',
          '--model',
          'claude-3-5-sonnet-latest'
        ],
        expect.objectContaining({
          input: 'diff string',
          listeners: expect.any(Object)
        })
      );
      
      expect(review).toBe('AI review feedback');
    });

    test('should return fallback message when no review is generated', async () => {
      fs.readFile.mockResolvedValue('# Review Guidelines');
      
      exec.mockImplementation((command, args, options) => {
        return Promise.resolve(0);
      });
      
      const review = await processor.generateReview('diff string');
      
      expect(review).toBe('No review feedback generated');
    });
  });

  describe('createInlineComments', () => {
    test('should parse feedback and create review comments', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: { head: { sha: 'commit-sha' } }
      });
      
      const mockCreateComment = jest.fn().mockResolvedValue({});
      
      processor.octokit.rest.pulls.get = mockGet;
      processor.octokit.rest.pulls.createReviewComment = mockCreateComment;
      
      const feedback = 'File: src/file1.js, Line(s): 42, Feedback: This could be improved';
      
      await processor.createInlineComments(feedback);
      
      expect(mockGet).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        pull_number: 123
      });
      
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        pull_number: 123,
        body: 'This could be improved',
        path: 'src/file1.js',
        line: 42,
        commit_id: 'commit-sha'
      });
    });

    test('should handle multiple feedback items in an array', async () => {
      processor.octokit.rest.pulls.get = jest.fn().mockResolvedValue({
        data: { head: { sha: 'commit-sha' } }
      });
      
      processor.octokit.rest.pulls.createReviewComment = jest.fn().mockResolvedValue({});
      
      const feedback = [
        'File: src/file1.js, Line(s): 42, Feedback: Feedback 1',
        'File: src/file2.js, Line(s): 10, Feedback: Feedback 2'
      ];
      
      await processor.createInlineComments(feedback);
      
      expect(processor.octokit.rest.pulls.createReviewComment).toHaveBeenCalledTimes(2);
    });

    test('should continue processing even if one comment fails', async () => {
      processor.octokit.rest.pulls.get = jest.fn().mockResolvedValue({
        data: { head: { sha: 'commit-sha' } }
      });
      
      // First call succeeds, second fails
      processor.octokit.rest.pulls.createReviewComment = jest.fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('API error'));
      
      const feedback = [
        'File: src/file1.js, Line(s): 42, Feedback: Feedback 1',
        'File: src/file2.js, Line(s): 10, Feedback: Feedback 2'
      ];
      
      await processor.createInlineComments(feedback);
      
      // It should attempt both comments despite the error
      expect(processor.octokit.rest.pulls.createReviewComment).toHaveBeenCalledTimes(2);
    });

    test('should handle invalid feedback format', async () => {
      processor.octokit.rest.pulls.get = jest.fn().mockResolvedValue({
        data: { head: { sha: 'commit-sha' } }
      });
      
      processor.octokit.rest.pulls.createReviewComment = jest.fn();
      
      const feedback = 'This is not in the expected format';
      
      await processor.createInlineComments(feedback);
      
         // Should not attempt to create a comment for invalid format
         expect(processor.octokit.rest.pulls.createReviewComment).not.toHaveBeenCalled();
        });
      });
    
      describe('processBatch', () => {
        test('should generate diff and review for a batch of files', async () => {
          // Mock getDiffForFiles to return a sample diff
          jest.spyOn(processor, 'getDiffForFiles').mockResolvedValue('mock diff content');
          
          // Mock generateReview to return a sample review
          jest.spyOn(processor, 'generateReview').mockResolvedValue('mock review content');
          
          const files = [
            { filename: 'src/file1.js' },
            { filename: 'src/file2.js' }
          ];
          
          const result = await processor.processBatch(files);
          
          expect(processor.getDiffForFiles).toHaveBeenCalledWith(files);
          expect(processor.generateReview).toHaveBeenCalledWith('mock diff content');
          expect(result).toBe('mock review content');
        });
    
        test('should handle empty file batch', async () => {
          jest.spyOn(processor, 'getDiffForFiles').mockResolvedValue('');
          jest.spyOn(processor, 'generateReview').mockResolvedValue('No changes to review');
          
          const result = await processor.processBatch([]);
          
          expect(processor.getDiffForFiles).toHaveBeenCalledWith([]);
          expect(result).toBe('No changes to review');
        });
      });
    
      describe('end-to-end workflow', () => {
        test('should process PR review workflow', async () => {
          // Mock all the necessary methods
          jest.spyOn(processor, 'getChangedFiles').mockResolvedValue([
            { filename: 'src/file1.js' },
            { filename: 'src/file2.js' }
          ]);
          
          jest.spyOn(processor, 'createBatches').mockReturnValue([
            [{ filename: 'src/file1.js' }],
            [{ filename: 'src/file2.js' }]
          ]);
          
          jest.spyOn(processor, 'processBatch')
            .mockResolvedValueOnce('Review for file1')
            .mockResolvedValueOnce('Review for file2');
          
          jest.spyOn(processor, 'createInlineComments').mockResolvedValue();
          
          // Simulate a complete workflow
          const files = await processor.getChangedFiles();
          expect(files).toHaveLength(2);
          
          const batches = processor.createBatches(files);
          expect(batches).toHaveLength(2);
          
          const reviews = [];
          for (const batch of batches) {
            const review = await processor.processBatch(batch);
            reviews.push(review);
          }
          
          expect(reviews).toEqual(['Review for file1', 'Review for file2']);
          
          await processor.createInlineComments(reviews);
          expect(processor.createInlineComments).toHaveBeenCalledWith(reviews);
        });
      });
    
      describe('edge cases', () => {
        test('should handle undefined patch in file objects', () => {
          const files = [
            { filename: 'src/file1.js' }, // No patch property
            { filename: 'src/file2.js', patch: null }
          ];
          
          const filtered = processor.filterFiles(files);
          expect(filtered).toHaveLength(2);
        });
    
        test('should handle errors from GitHub API', async () => {
          processor.octokit.rest.pulls.listFiles = jest.fn().mockRejectedValue(
            new Error('API rate limit exceeded')
          );
          
          await expect(processor.getChangedFiles()).rejects.toThrow('API rate limit exceeded');
        });
    
        test('should handle command execution errors', async () => {
          exec.mockImplementation(() => {
            throw new Error('Command execution failed');
          });
          
          await expect(processor.getDiffForFiles([{ filename: 'file.js' }]))
            .rejects.toThrow('Command execution failed');
        });
    
        test('should handle file read errors for review guidelines', async () => {
          fs.readFile.mockRejectedValue(new Error('File not found'));
          
          await expect(processor.generateReview('diff')).rejects.toThrow('File not found');
        });
      });
    });
    