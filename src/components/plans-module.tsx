import React, { useEffect, useState } from "react";
import styles from "./plans-module.module.css";
import Image from "next/image";
import { getUserSubscription, getPayments, getInvoice, GetInvoiceSuccessResponse, ErrorResponse } from "@/app/dashboard/actions";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

interface Subscription {
  id: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  plan: {
    id: string;
    name: string;
    price: number;
  };
}

interface Payment {
  txnId: string;
  status: string;
  failedReason: string | null;
  amount: number;
  initiatedAt: string;
  settledAt: string | null;
  invoiceUrl: string | null;
  invoiceId: string | null;
  planName: string;
}

export default function PlansModule() {
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch subscription data
    async function fetchSubscription() {
      setSubscriptionLoading(true);
      try {
        const subRes = await getUserSubscription();
        if (subRes.success) {
          if (subRes.subscription) {
            setSubscription({
              ...subRes.subscription,
              startDate: new Date(subRes.subscription.startDate).toISOString(),
              endDate: new Date(subRes.subscription.endDate).toISOString(),
            });
          } else {
            setSubscription(null);
          }
        } else {
          setError(subRes.errorMessage || "Failed to fetch subscription");
        }
      } catch (e) {
        setError("Failed to fetch subscription");
      } finally {
        setSubscriptionLoading(false);
      }
    }

    // Fetch payments data
    async function fetchPayments() {
      setPaymentsLoading(true);
      try {
        const payRes = await getPayments();
        if (payRes.success) {
          setPayments(
            payRes.payments.map((p) => ({
              ...p,
              initiatedAt: new Date(p.initiatedAt).toISOString(),
              settledAt: p.settledAt ? new Date(p.settledAt).toISOString() : null,
            }))
          );
        } else {
          setError(payRes.errorMessage || "Failed to fetch payments");
        }
      } catch (e) {
        setError("Failed to fetch payments");
      } finally {
        setPaymentsLoading(false);
      }
    }

    // Start both requests independently
    fetchSubscription();
    fetchPayments();
  }, []);

  const planImages: Record<string, string> = {
    Professional: "/1.png",
    Business: "/2.png",
    Advanced: "/3.png",
  };

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  const handleInvoiceAction = async (invoiceId: string) => {
    try {
      setLoadingInvoiceId(invoiceId);
      const response = await getInvoice(invoiceId) as GetInvoiceSuccessResponse;
      if (!response.success) {
        console.log("Failed to fetch invoice", response);
        toast({
          title: response.error || "Failed to fetch invoice",
          description: response.errorMessage || 'Failed to fetch invoice',
          variant: "destructive",
          duration: 4000,
        });
      } else if (response.invoiceUrl) {
          window.open(response.invoiceUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      toast({
        title: "Failed to process invoice",
        description: 'Failed to process invoice',
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setLoadingInvoiceId(null);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.subscriptionHeading} style={{ marginBottom: 24 }}>Subscription</h2>
      <div className={styles.subscriptionCard}>
        {subscriptionLoading ? (
          <div className={styles.bufferContainer}>
            <div className={styles.bufferSpinner}></div>
            <div className={styles.bufferText}>Loading your subscription details...</div>
          </div>
        ) : error ? (
          <div style={{ color: "#dc2626" }}>{error}</div>
        ) : subscription ? (
          <>
            <div className={styles.planInfo}>
              <div style={{ fontSize: 16, color: "#6b7280", marginBottom: 4 }}>Plan</div>
              <div className={styles.planTitle}>{subscription.plan.name}</div>
              <div className={styles.planDetails}>
                <div>
                  <div style={{ fontSize: 14, color: "#6b7280" }}>Status</div>
                  <div className={styles.planStatus}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#059669" }}></span> Active
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 14, color: "#6b7280" }}>Price/year</div>
                  <div style={{ fontWeight: 500 }}>₹{subscription.plan.price.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 14, color: "#6b7280" }}>Expires on</div>
                  <div style={{ fontWeight: 500 }}>{formatDate(subscription.endDate)}</div>
                </div>
              </div>
            </div>
            <div className={styles.features}>
              <div className={styles.featuresTitle}>Included in Plan</div>
              <ul className={styles.featureList}>
                <li className={styles.featureItem}>
                  <Image src="/tick.svg" alt="tick" width={16} height={16} style={{ marginRight: 8 }} />
                  Form 16
                </li>
                <li className={styles.featureItem}>
                  <Image src="/tick.svg" alt="tick" width={16} height={16} style={{ marginRight: 8 }} />
                  Other income
                </li>
                <li className={styles.featureItem}>
                  <Image src="/tick.svg" alt="tick" width={16} height={16} style={{ marginRight: 8 }} />
                  Tax optimisation
                </li>
              </ul>
            </div>
            <div className={styles.planImage}>
              <Image src={planImages[subscription.plan.name] || "/1.png"} alt={subscription.plan.name} width={100} height={100} style={{ margin: "0 auto" }} />
            </div>
          </>
        ) : (
          <div>No active subscription found.</div>
        )}
      </div>
      <h3 className={styles.invoicesTitle}>Invoices or Receipts</h3>
      <div className={styles.tableWrapper}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {paymentsLoading ? (
              <tr>
                <td colSpan={5} style={{ padding: 24 }}>
                  <div className={styles.bufferContainer}>
                    <div className={styles.bufferSpinner}></div>
                    <div className={styles.bufferText}>Loading your payment history...</div>
                  </div>
                </td>
              </tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 24 }}>No payments found.</td></tr>
            ) : (
              payments
                .filter(p => p.status === "success")
                .sort((a, b) => new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime())
                .map((payment, idx) => (
                  <tr key={payment.txnId} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "16px 24px" }}>{formatDate(payment.initiatedAt)}</td>
                    <td style={{ padding: "16px 24px" }}>{payment.planName}</td>
                    <td style={{ padding: "16px 24px" }}>₹{payment.amount.toLocaleString()}</td>
                    <td style={{ padding: "16px 24px" }}>
                      <span style={{ 
                        color: payment.status === "success" ? "#059669" : "#dc2626",
                        fontWeight: 500
                      }}>
                        {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      {payment.invoiceId ? (
                        <div style={{ display: 'flex', gap: '16px' }}>
                          <button 
                            onClick={() => handleInvoiceAction(payment.invoiceId!)}
                            disabled={loadingInvoiceId === payment.invoiceId}
                            style={{ 
                              color: "#ef4444", 
                              fontWeight: 500, 
                              textDecoration: "none",
                              background: 'none',
                              border: 'none',
                              cursor: loadingInvoiceId === payment.invoiceId ? 'not-allowed' : 'pointer',
                              padding: 0,
                              opacity: loadingInvoiceId === payment.invoiceId ? 0.7 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            {loadingInvoiceId === payment.invoiceId ? (
                              <>
                                <div className={styles.spinner}></div>
                                Processing...
                              </>
                            ) : (
                              'Download'
                            )}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>Invoice not available</span>
                      )}
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
      <Toaster />
    </div>
  );
}
