const { FeedbackAggregator } = require('../src/lib/aggregator');
const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs').promises;
const path = require('path');

jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('fs').promises;

describe('FeedbackAggregator', () => {
  let aggregator;
  
  beforeEach(() => {
    aggregator = new FeedbackAggregator();
    core.getInput.mockImplementation((name) => {
      if (name === 'programming_environment') return 'Swift, iOS';
      return '';
    });
    exec.exec.mockResolvedValue(0);
  });

  test('combines feedback files with timestamps', async () => {
    const mockFiles = [
      'feedback/batch_1_20240101_120000.txt',
      'feedback/batch_2_20240101_120001.txt'
    ];
    
    fs.readFile
      .mockResolvedValueOnce('File: Test.swift, Line(s): 10, Feedback: Use guard statement')
      .mockResolvedValueOnce('File: Main.swift, Line(s): 20, Feedback: Add documentation');

    const combined = await aggregator.combineFeedbackFiles(mockFiles);
    expect(combined).toContain('Test.swift');
    expect(combined).toContain('Main.swift');
    expect(fs.writeFile).toHaveBeenCalled();
  });

  test('generates summary using Cody CLI', async () => {
    const mockFiles = [
      'feedback/batch_1_20240101_120000.txt',
      'feedback/batch_2_20240101_120001.txt'
    ];

    const summary = await aggregator.generateSummary(mockFiles);
    expect(exec.exec).toHaveBeenCalledWith(
      'cody',
      ['chat', '--stdin', '-m', expect.stringContaining('Swift, iOS')],
      expect.any(Object)
    );
  });

  test('posts final review to GitHub', async () => {
    const mockOctokit = {
      pulls: {
        createReview: jest.fn().mockResolvedValue({})
      }
    };
    const mockContext = {
      repo: { owner: 'hello', repo: 'review-agent' },
      issue: { number: 123 }
    };
    const mockSummary = 'Comprehensive review summary';

    await aggregator.postFinalReview(mockOctokit, mockContext, mockSummary);
    expect(mockOctokit.pulls.createReview).toHaveBeenCalledWith({
      owner: 'hello',
      repo: 'review-agent',
      pull_number: 123,
      body: mockSummary,
      event: 'COMMENT'
    });
  });
});