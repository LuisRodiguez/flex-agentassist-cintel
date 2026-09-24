'use client';

import { useEffect, useState } from 'react';

type OperatorResult = {
  id?: string;
  timestamp: string;
  conversationId?: string;
  operator:
    | string
    | {
        id?: string;
        friendlyName: string;
        version?: number;
        parameters?: Record<string, any>;
      };
  result: any;
};

interface NextBestActionProps {
  operatorResults: OperatorResult[];
}

export default function NextBestAction({
  operatorResults,
}: NextBestActionProps) {
  
  const [explanation, setExplanation] = useState<string>('');


  // Update dimensions based on operator results
  useEffect(() => {
    console.log(
      '[NextBestAction] Processing operatorResults:',
      operatorResults,
    );
    if (operatorResults.length === 0) {
      console.log(
          '[NextBestAction] No operatorResults, resetting dimensions:',
      );
      return;
    }

    // Get the latest Script Adherence operator result
    const nextBestActionResults = operatorResults.filter((result) => {
      const operatorName =
        typeof result.operator === 'string'
          ? result.operator
          : result.operator?.friendlyName || '';
      return (
        operatorName.toLowerCase().includes('next') ||
        operatorName.toLowerCase().includes('best') ||
        operatorName.toLowerCase().includes('action')
      );
    });
    console.log(
      '[NextBestAction] Filtered next best action results:',
      nextBestActionResults,
    );

    if (nextBestActionResults.length === 0) {
      console.log('[NextBestAction] No next best action results found.');
      return;
    }
    
    // Use the latest result
    const latestResult =
      nextBestActionResults[nextBestActionResults.length - 1];
    const resultData = latestResult.result;
    console.log(
      '[NextBestAction] Latest next best action resultData:',
      resultData,
    );

  }, [operatorResults]);

  return (
    <div
      style={{
        padding: '20px',
        borderRadius: '8px',
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
        width: '100%',
        maxWidth: '800px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ marginBottom: '16px' }}>
        <h2
          style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#1f2937',
            marginBottom: '4px',
          }}
        >
          Next Best Actions
        </h2>
        <div style={{ fontSize: '13px', color: '#6b7280' }}>
          Suggesting the next best actions for the agent
        </div>
      </div>

      {/* List of Next Best Actions */}
      <div style={{ marginBottom: '16px' }}>
        <div
          style={{
            width: '100%',
            height: '18px',
            backgroundColor: '#e5e7eb',
            borderRadius: '3px',
            overflow: 'hidden',
          }}
        >
          {JSON.stringify(operatorResults.filter((result) => {
            const operatorName =
              typeof result.operator === 'string'
                ? result.operator
                : result.operator?.friendlyName || '';
            return (
              operatorName.toLowerCase().includes('next') ||
              operatorName.toLowerCase().includes('best') ||
              operatorName.toLowerCase().includes('action')
            );
          }))}
        </div>
      </div>
    </div>

  );
}
