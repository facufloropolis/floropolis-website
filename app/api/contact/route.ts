import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.name || !data.email || !data.message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Send email with contact form details
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: ['facu@floropolis.com', 'jjp@floropolis.com'],
      replyTo: data.email,
      subject: `Contact Form: ${data.subject || 'General Inquiry'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; color: white; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">New Contact Form Submission</h1>
          </div>
          
          <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none;">
            
            <div style="background-color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #10b981;">
              <h2 style="color: #10b981; margin-top: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px;">Contact Information</h2>
              <p style="margin: 8px 0;"><strong>Name:</strong> ${data.name}</p>
              <p style="margin: 8px 0;"><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
              ${data.phone ? `<p style="margin: 8px 0;"><strong>Phone:</strong> <a href="tel:${data.phone}">${data.phone}</a></p>` : ''}
            </div>
            
            <div style="background-color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #3b82f6;">
              <h2 style="color: #3b82f6; margin-top: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px;">Inquiry Details</h2>
              <p style="margin: 8px 0;"><strong>Subject:</strong> ${data.subject || 'General Inquiry'}</p>
            </div>
            
            <div style="background-color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #8b5cf6;">
              <h2 style="color: #8b5cf6; margin-top: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px;">Message</h2>
              <p style="margin: 8px 0; white-space: pre-wrap;">${data.message}</p>
            </div>
            
          </div>
          
          <div style="background-color: #f1f5f9; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: 1px dashed #cbd5e1;">
            <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
              <strong>Next Steps:</strong> Reply to this email to respond directly to ${data.name}. They should receive a response within 1 business day.
            </p>
          </div>
        </div>
      `,
    });
    
    return NextResponse.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}

