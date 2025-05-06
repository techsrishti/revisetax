import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import getRawBody from "raw-body";

interface PayuWebhookPayload {
    mihpayid: string;
    mode: string;
    status: string;
    unmappedstatus: string;
    key: string;
    txnid: string;
    amount: string;
    cardCategory: string;
    discount: string;
    net_amount_debit: string;
    addedon: string;
    productinfo: string;
    firstname: string;
    lastname: string;
    address1: string;
    address2: string;
    city: string;
    state: string;
    country: string;
    zipcode: string;
    email: string;
    phone: string;
    udf1: string;
    udf2: string;
    udf3: string;
    udf4: string;
    udf5: string;
    udf6: string;
    udf7: string;
    udf8: string;
    udf9: string;
    udf10: string;
    hash: string;
    field1: string;
    field2: string;
    field3: string;
    field4: string;
    field5: string;
    field6: string;
    field7: string;
    field8: string;
    field9: string;
    payment_source: string;
    pa_name: string;
    PG_TYPE: string;
    bank_ref_num: string;
    bankcode: string;
    error: string;
    error_Message: string;
    cardnum: string;
}

function isPayuWebhookPayload(obj: any): obj is PayuWebhookPayload {
    if (typeof obj !== 'object' || obj === null) return false;
  
    const requiredKeys: (keyof PayuWebhookPayload)[] = [
      "mihpayid", "mode", "status", "unmappedstatus", "key", "txnid", "amount", "cardCategory",
      "discount", "net_amount_debit", "addedon", "productinfo", "firstname", "lastname",
      "address1", "address2", "city", "state", "country", "zipcode", "email", "phone",
      "udf1", "udf2", "udf3", "udf4", "udf5", "udf6", "udf7", "udf8", "udf9", "udf10",
      "hash", "field1", "field2", "field3", "field4", "field5", "field6", "field7", "field8", "field9",
      "payment_source", "pa_name", "PG_TYPE", "bank_ref_num", "bankcode", "error", "error_Message", "cardnum"
    ];
  
    return requiredKeys.every((key) => typeof obj[key] === "string");
  }
  
export async function POST(request: NextRequest) {
    try {
        const startDate = new Date()
        const rawBody = await request.text();
        const formData = new URLSearchParams(rawBody);
        const payloadRaw = Object.fromEntries(formData.entries());

        console.log('Payload Raw', payloadRaw)

        if (!isPayuWebhookPayload(payloadRaw)) {
            throw new Error("Invalid PayU Webhook payload received");
        }

        const payload: PayuWebhookPayload = payloadRaw;

        const payment = await prisma.payment.findUnique({
            where: {
                txnId: payload.txnid
            }, 
            select: { 
                id: true, 
                planId: true, 
                txnId: true, 
                status: true, 
                amount: true, 
                hash: true, 
                expiresAt: true, 
            }
        })

        if (!payment) {
            console.log("Payment not found")
            return NextResponse.json({
                success: false,
                error: "Payment not found",
            }, { status: 404 });
        }

        if (payload.hash !== payment?.hash) {
            return NextResponse.json({
                success: false,
                error: "Hash mismatch",
                errorMessage: "Evadra nuvvu. Pakkaku vellu aaduko.",
            }, { status: 400 });
        }
        
        if (!payment) {
            console.log("Payment not found", payload)
            return NextResponse.json({
                success: false,
                error: "Payment not found",
            }, { status: 404 });
        }

        if (payment.status !== "initiated") {
            console.log("Payment already processed", payment)
            return NextResponse.json({
                success: false,
                error: "Payment already processed",
            }, { status: 400 });
        }

        if (payload.status === "success") {
            const updatePayment = await prisma.payment.update({ 
                where: {
                    id: payment.id
                }, 
                data: {
                    status: "success",
                    settledAt: new Date(),                    
                }
            })

            console.log("Payment updated", updatePayment)
        }

        if (payload.status === "failed") {
            const updatePayment = await prisma.payment.update({ 
                where: {
                    id: payment.id
                }, 
                data: {
                    status: "failed",
                    settledAt: new Date(),
                }
            })

            console.log("Payment updated", updatePayment)
        }


        const endDate = new Date();
        console.log("Time taken", endDate.getTime() - startDate.getTime(), "ms")
        return NextResponse.json({
            success: true,
            message: "Payment processed successfully",
        }, { status: 200 });
        
        
    } catch (error) {
        console.log("Error processing payu webhook:", error);
        return NextResponse.json({
            success: false,
            error: "Internal server error",
        }, { status: 500 });
    }
}