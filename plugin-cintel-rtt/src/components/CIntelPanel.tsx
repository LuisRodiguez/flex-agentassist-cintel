'use client';

import { useState, useEffect, useRef } from 'react';
import ScriptAdherence from './ScriptAdherence';
import NextBestAction from './NextBestAction';
import OperatorResultLog from './OperatorResultLog';
import TranscriptPanel, { TranscriptEntry } from './TranscriptPanel';
import { Button } from '@twilio-paste/core/';
import { AgentIcon } from '@twilio-paste/icons/esm/AgentIcon';

type PluginConfig = {
  serverless_function_base: string;
  backend_server: string;
};

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
  outputFormat?: 'TEXT' | 'JSON' | 'CLASSIFICATION' | 'EXTRACTION';
  result: any;
  referenceIds?: string[];
  executionDetails?: {
    trigger?: {
      on: 'COMMUNICATION' | 'CONVERSATION_END';
      timestamp: string;
    };
    communications?: {
      first: string | null;
      last: string | null;
    };
    channels?: string[];
    participants?: Array<{
      id: string;
      profileId: string;
      type: 'HUMAN_AGENT' | 'CUSTOMER' | 'AI_AGENT';
    }>;
    context?: Record<string, any>;
  };
  rawPayload?: any;
};

interface CINTELPanelProps {
  manager: any;
  task: any;
}

type TabType = 'next-best-action';

// manager: Flex Manager, task: Flex Task
// You will need to extract callSid or other identifiers from task as needed for SSE
export default function CINTELPanel({ manager, task }: CINTELPanelProps) {
  // Support both inbound and outbound calls
  // Inbound: call_sid
  // Outbound: conference.participants.customer (the customer call leg)
  const callSid =
    task?.attributes?.call_sid ||
    task?.attributes?.conference?.participants?.customer ||
    task?.attributes?.conference_sid ||
    task?.attributes?.conference?.sid ||
    task?.sid; // Fallback to task sid

  const channel =
    task?.taskChannelUniqueName === 'voice' ||
    task?.attributes?.direction === 'outbound'
      ? 'voice'
      : 'digital';
  const description = task?.attributes?.description || 'Transferred by AI agent under customer request';
  const [activeTab, setActiveTab] = useState<TabType>('next-best-action');
  const [unreadCount, setUnreadCount] = useState(0);
  const previousCountRef = useRef(0);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [operatorResults, setOperatorResults] = useState<OperatorResult[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const previousTaskSidRef = useRef<string | null>(null);

  // Server URL from environment or default
  const serverUrl = process.env.REACT_APP_BACKEND_URL || '';

  // Log URLs only on first load
  useEffect(() => {
    console.log('CINTELPanel: Component mounted/updated', {
      serverUrl,
      taskChannelUniqueName: task?.taskChannelUniqueName,
      taskSid: task?.sid,
      direction: task?.attributes?.direction,
      call_sid: task?.attributes?.call_sid,
      customer_call_sid: task?.attributes?.conference?.participants?.customer,
      conference_sid: task?.attributes?.conference_sid,
      conference: task?.attributes?.conference,
      resolvedCallSid: callSid,
      channel,
      allTaskAttributes: task?.attributes,
      description: task?.attributes?.description,
    });
  }, [task?.sid, callSid]);

  // Reset state when task changes
  useEffect(() => {
    const currentTaskSid = task?.sid;

    if (currentTaskSid && currentTaskSid !== previousTaskSidRef.current) {
      console.log('CINTELPanel: Task changed, resetting state', {
        previousSid: previousTaskSidRef.current,
        currentSid: currentTaskSid,
        callSid: callSid,
      });

      // Reset all state
      setTranscript([]);
      setOperatorResults([]);
      setUnreadCount(0);
      previousCountRef.current = 0;
      setActiveTab('next-best-action');

      previousTaskSidRef.current = currentTaskSid;
    }
  }, [task?.sid, callSid]);

  // SSE connection for transcript and operator results
  useEffect(() => {
    console.log('CINTELPanel: SSE useEffect triggered', {
      callSid: callSid,
      serverUrl: serverUrl,
    });

    if (!callSid) {
      console.log('CINTELPanel: No callSid available, skipping SSE connection');
      return;
    }

    // Clean up previous connection
    if (eventSourceRef.current) {
      console.log('CINTELPanel: Closing previous SSE connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const sessionId = callSid;

    const eventSource = new EventSource(`${serverUrl}/api/stream/${sessionId}`);

    console.log(
      `CINTELPanel: Establishing SSE connection to ${eventSource.url}`,
    );

    eventSource.onopen = () => {
      console.log('CINTELPanel: SSE connection opened successfully');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('CINTELPanel: Received SSE message', data.type);
        switch (data.type) {
          case 'initial':
            console.log('CINTELPanel: Initial data received', {
              transcriptCount: data.transcript?.length || 0,
              operatorResultsCount: data.operatorResults?.length || 0,
            });
            console.log('CINTELPanel: Initial data !!!!!*****', data);
            if (data.transcript) setTranscript(data.transcript);
            if (data.operatorResults) setOperatorResults(data.operatorResults);
            break;
          case 'transcript':
            console.log('CINTELPanel: Transcript update received');
            setTranscript((prev) => [...prev, data.data]);
            break;
          case 'operator-result':
            console.log('CINTELPanel: Operator result received', data.data);
            setOperatorResults((prev) => [...prev, data.data]);
            console.log('CINTELPanel: Updated operatorResults', [
              ...operatorResults,
              data.data,
            ]);
            break;
          default:
            console.log('CINTELPanel: Unknown message type', data.type);
            break;
        }
      } catch (error) {
        console.error('CINTELPanel: Error parsing SSE message', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('CINTELPanel: SSE connection error', error);
      eventSource.close();
    };

    eventSourceRef.current = eventSource;

    return () => {
      eventSource.close();
    };
  }, [callSid, serverUrl]);

  // Track new operator results and update badge count
  useEffect(() => {
    if (operatorResults.length > previousCountRef.current) {
      //if (activeTab !== 'operator-log') {
      if (activeTab !== 'next-best-action') {
        const newResults = operatorResults.length - previousCountRef.current;
        setUnreadCount((prev) => prev + newResults);
      }
    }
    previousCountRef.current = operatorResults.length;
  }, [operatorResults, activeTab]);

  // Clear unread count when switching to operator log tab
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    //if (tab === 'operator-log') {
    if (tab === 'next-best-action') {
      setUnreadCount(0);
    }
  };

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '8px',
        padding: '0',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
        minWidth: 0,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Tab Navigation - Only show when there's an active task */}
      {callSid && (
        <div
          style={{
            display: 'flex',
            borderBottom: '2px solid #e5e7eb',
            backgroundColor: '#f9fafb',
          }}
        >

          {/*<button
            onClick={() => handleTabChange('operator-log')}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '10px 12px',
              fontSize: '12px',
              fontWeight: '600',
              color: activeTab === 'operator-log' ? '#1f2937' : '#6b7280',
              backgroundColor:
                activeTab === 'operator-log' ? 'white' : 'transparent',
              border: 'none',
              borderBottom:
                activeTab === 'operator-log'
                  ? '2px solid #3b82f6'
                  : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            onMouseOver={(e) => {
              if (activeTab !== 'operator-log') {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }
            }}
            onMouseOut={(e) => {
              if (activeTab !== 'operator-log') {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <span>Operator Result Log</span>
            {unreadCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '20px',
                  height: '20px',
                  padding: '0 6px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: '700',
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>*/}

          <button
            onClick={() => handleTabChange('next-best-action')}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '10px 12px',
              fontSize: '12px',
              fontWeight: '600',
              color: activeTab === 'next-best-action' ? '#1f2937' : '#6b7280',
              backgroundColor:
                activeTab === 'next-best-action' ? 'white' : 'transparent',
              border: 'none',
              borderBottom:
                activeTab === 'next-best-action'
                  ? '2px solid #3b82f6'
                  : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            onMouseOver={(e) => {
              if (activeTab !== 'next-best-action') {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }
            }}
            onMouseOut={(e) => {
              if (activeTab !== 'next-best-action') {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <span>Next Best Action</span>
            {unreadCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '20px',
                  height: '20px',
                  padding: '0 6px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: '700',
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Tab Content */}
      {callSid && (
        <div
          style={{
            padding: '16px',
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            minHeight: 0,
            minWidth: 0,
          }}
        >
          {activeTab === 'next-best-action' && (() => {
            const getName = (op: OperatorResult['operator']) =>
              typeof op === 'string' ? op : op?.friendlyName || '';
            const latestResult = [...operatorResults]
              .reverse()
              .find((r) =>
                getName(r.operator).toLowerCase().includes('next') ||
                getName(r.operator).toLowerCase().includes('best') ||
                getName(r.operator).toLowerCase().includes('action'),
              );
            const latestSummary = [...operatorResults]
              .reverse()
              .find((r) =>
                getName(r.operator).toLowerCase().includes('summary'),
              );
              const latestSentiment = [...operatorResults]
                .reverse()
                .find((r) =>
                  getName(r.operator).toLowerCase().includes('sentiment'),
                );
              const sentimentLabel: string =
                latestSentiment?.result?.label ?? '';
              const sentimentColor =
                sentimentLabel === 'positive'
                  ? '#10b981'
                  : sentimentLabel === 'negative'
                    ? '#ef4444'
                    : '#6b7280';
            return (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  width: '100%',
                  maxWidth: '800px',
                  boxSizing: 'border-box',
                }}
              >

                {/*Transfer Context card*/}
                <div
                    style={{ display: 'flex', gap: '8px', overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        fontSize: '12px',
                        color: '#1f2937',
                      }}
                    >
                      <h2
                        style={{
                          fontSize: '18px',
                          fontWeight: '600',
                          color: '#1f2937',
                          marginBottom: '4px',
                        }}
                      >
                      Context for Transfer
                      </h2>
                      {description ? (
                        <div
                          style={{
                            padding: '12px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            background: '#f9fafb',
                          }}
                        >
                          {(typeof description === 'string'
                            ? description
                            : description?.text || JSON.stringify(description, null, 2)
                          )
                            .split('\n')
                            .filter(Boolean)
                            .map((item: string, index: number) => (
                              <div
                                key={index}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  marginBottom: '8px',
                                }}
                              >
                                <span
                                  style={{
                                    color: '#2563eb',
                                    marginRight: '8px',
                                    fontWeight: 600,
                                  }}
                                >
                                  •
                                </span>
                                <span>{item}</span>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>Pending...</span>
                      )}
                    </div>
                  </div>


                {/*Script Adherence Card*/}
                <ScriptAdherence operatorResults={operatorResults} />

                {/*Next Best Action Card*/}
                <div
                    style={{ display: 'flex', gap: '8px', overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        fontSize: '12px',
                        color: '#1f2937',
                      }}
                    >
                      <h2
                        style={{
                          fontSize: '18px',
                          fontWeight: '600',
                          color: '#1f2937',
                          marginBottom: '4px',
                        }}
                      >
                      Next Best Action
                      </h2>
                      {latestResult ? (
                        <div
                          style={{
                            padding: '12px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            background: '#f9fafb',
                          }}
                        >
                          {(typeof latestResult.result === 'string'
                            ? latestResult.result
                            : latestResult.result?.text || JSON.stringify(latestResult.result, null, 2)
                          )
                            .split('\n')
                            .filter(Boolean)
                            .map((item: string, index: number) => (
                              <div
                                key={index}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  marginBottom: '8px',
                                }}
                              >
                                <span
                                  style={{
                                    color: '#2563eb',
                                    marginRight: '8px',
                                    fontWeight: 600,
                                  }}
                                >
                                  •
                                </span>
                                <span>{item}</span>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>Pending...</span>
                      )}
                    </div>
                  </div>
                
                {/*Sentiment Card*/}
                <div
                    style={{ display: 'flex', gap: '8px', overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        fontSize: '12px',
                        minWidth: '90px',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: '600',
                          color: '#6b7280',
                          marginBottom: '4px',
                          fontSize: '11px',
                        }}
                      >
                        SENTIMENT
                      </div>
                      {latestSentiment ? (
                        <span
                          style={{
                            fontWeight: '600',
                            color: sentimentColor,
                            textTransform: 'capitalize',
                          }}
                        >
                          {sentimentLabel}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>Pending...</span>
                      )}
                    </div>
                  </div>
                  {/*Summary Card*/}
                <div
                    style={{ display: 'flex', gap: '8px', overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        fontSize: '12px',
                        color: '#1f2937',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: '600',
                          color: '#6b7280',
                          marginBottom: '4px',
                          fontSize: '11px',
                        }}
                      >
                        SUMMARY
                      </div>
                      {latestSummary ? (
                        <span style={{ wordBreak: 'break-word' }}>
                          {typeof latestSummary.result === 'string'
                            ? latestSummary.result
                            : (latestSummary.result?.summary ??
                              latestSummary.result?.text ??
                              JSON.stringify(latestSummary.result))}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>Pending...</span>
                      )}
                    </div>
                  </div>
              </div>
            );
          })()}
          {/*activeTab === 'operator-log' && (
            <div
              style={{
                width: '100%',
                maxWidth: '800px',
                boxSizing: 'border-box',
              }}
            >
              <OperatorResultLog operatorResults={operatorResults} />
            </div>
          )*/}
        </div>
      )}
    </div>
  );
}
