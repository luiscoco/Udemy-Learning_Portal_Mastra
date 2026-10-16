import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HealthStatus } from './HealthStatus';

describe('HealthStatus', () => {
  it('shows API status and Mastra version', async () => {
    render(
      <HealthStatus
        load={async () => ({
          status: 'ok',
          service: 'api',
          version: '0.1.0',
          uptimeSeconds: 3,
          mode: 'offline',
          mastraVersion: '1.78.0',
          timestamp: new Date().toISOString(),
        })}
      />,
    );
    expect(await screen.findByTestId('api-status')).toHaveTextContent('ok');
    expect(screen.getByText('@mastra/core 1.78.0')).toBeInTheDocument();
  });

  it('shows an accessible error when the API fails', async () => {
    render(<HealthStatus load={() => Promise.reject(new Error('connection refused'))} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('connection refused');
  });
});
