"use server"
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { redirect } from 'next/navigation';

interface PayuCallbackPayload {
    mihpayid: string;
    mode: string;
    status: string;
    unmappedstatus: string;
    key: string;
    txnid: string;
    amount: string;
    productinfo: string;
    firstname: string;
    email: string;
    hash: string;
    error: string;
    error_Message: string;
}

function isPayuCallbackPayload(obj: any): obj is PayuCallbackPayload {
    if (typeof obj !== 'object' || obj === null) return false;
  
    const requiredKeys: (keyof PayuCallbackPayload)[] = [
        "mihpayid", "mode", "status", "unmappedstatus", "key", "txnid", "amount",
        "productinfo", "firstname", "email", "hash", "error", "error_Message"
    ];
  
    return requiredKeys.every((key) => typeof obj[key] === "string");
}

export async function POST(request: NextRequest) {
    try {
        const rawBody = await request.text();
        const formData = new URLSearchParams(rawBody);
        const payloadRaw = Object.fromEntries(formData.entries());

        if (!isPayuCallbackPayload(payloadRaw)) {
            const response = NextResponse.redirect(new URL('/dashboard', request.url), {
                status: 302
            });
            response.cookies.set('showPopup', '1');
            response.cookies.set('paymentError', payloadRaw.error_Message || 'Payment failed');
            return response;
        }

        const payload: PayuCallbackPayload = payloadRaw;

        // Verify hash
        const hashString = `${process.env.PAYU_SALT_32BIT}|${payload.status}|||||||||||${payload.email}|${payload.firstname}|${payload.productinfo}|${payload.amount}|${payload.txnid}|${process.env.PAYU_KEY}`;
        const hash = crypto.createHash('sha512').update(hashString).digest('hex');

        if (payload.hash !== hash) {
            const response = NextResponse.redirect(new URL('/dashboard', request.url), {
                status: 302
            });
            response.cookies.set('showPopup', '1');
            response.cookies.set('paymentError', 'Hash mismatch');
            return response;
        }

        // Set popup status based on payment status
        const popupStatus = payload.status === "success" ? 0 : 1;
        
        // Create response with redirect
        const response = NextResponse.redirect(new URL('/dashboard', request.url), {
            status: 302
        });

        // Set cookies
        response.cookies.set('showPopup', popupStatus.toString(), {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 5 // 5 minutes
        });

        if (popupStatus === 1) {
            response.cookies.set('paymentError', payload.error_Message || 'Payment failed', {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 5 // 5 minutes
            });
        }

        return response;

    } catch (error) {
        console.error("Error processing payu callback:", error);
        const response = NextResponse.redirect(new URL('/dashboard', request.url), {
            status: 302
        });
        response.cookies.set('showPopup', '1');
        response.cookies.set('paymentError', 'Internal server error');
        return response;
    }
}
