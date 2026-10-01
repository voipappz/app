#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Sends one plain-text email, over SMTP, and never fails the caller.
#
#   notify-email.rb "Subject line"  < body-on-stdin
#
# RUBY, not `sendmail`. The kamal image's /usr/sbin/sendmail is a busybox
# applet — it can speak SMTP, but its auth and TLS handling are thin and its
# failure mode is an exit code with no message. Ruby is in the image (3.4) and
# `net/smtp` is there with it, so STARTTLS and PLAIN auth are the library's
# problem rather than ours.
#
# INERT WHEN UNCONFIGURED. No SMTP address, or no recipient, means no mail and
# exit 0 — a deployment that has not been given a mail server must not have its
# deploys fail over it.
#
# IT NEVER FAILS THE DEPLOY. The container is already live and healthy by the
# time this runs; a mail server that is down, slow or refusing auth is not a
# reason to report a good deploy as bad. Failures are printed and swallowed.
#
# THE PASSWORD IS NEVER PRINTED, including in the exception path — an SMTP
# error carries the command that failed, and for AUTH PLAIN that command is the
# credential.

require "net/smtp"
# `Time#rfc2822` lives here, not in core. Without it the script died on the
# Date header — after the deploy had already succeeded.
require "time"

def env(name)
  value = ENV[name].to_s.strip
  value.empty? ? nil : value
end

address  = env("ORGANIZATION_SMTP_ADDRESS")
from     = env("ORGANIZATION_SMTP_FROM")
to       = env("ORGANIZATION_SMTP_TO") || from
port     = (env("ORGANIZATION_SMTP_PORT") || "587").to_i
user     = env("ORGANIZATION_SMTP_USERNAME")
password = env("ORGANIZATION_SMTP_PASSWORD")
domain   = env("ORGANIZATION_SMTP_DOMAIN") || "localhost"
auth     = (env("ORGANIZATION_SMTP_AUTHENTICATION") || "plain").to_sym

subject = ARGV[0].to_s
body    = $stdin.read

if address.nil? || to.nil?
  puts "  ·  email: not configured (ORGANIZATION_SMTP_ADDRESS/FROM unset) — skipping"
  exit 0
end

# CRLF line endings and a Date header, because some servers are strict about
# both and SES is one of them.
message = <<~MAIL.gsub(/\n/, "\r\n")
  From: #{from}
  To: #{to}
  Subject: #{subject}
  Date: #{Time.now.rfc2822}
  Content-Type: text/plain; charset=UTF-8

  #{body}
MAIL

begin
  smtp = Net::SMTP.new(address, port)
  smtp.open_timeout = 10
  smtp.read_timeout = 15
  # 587 is the submission port: plain connection, then STARTTLS. 465 is
  # implicit TLS instead, which is a different call.
  port == 465 ? smtp.enable_tls : smtp.enable_starttls_auto

  smtp.start(domain, user, password, auth) do |session|
    session.send_message(message, from, to.split(","))
  end

  puts "  ✓  email sent to #{to}"
rescue StandardError => error
  # The class only. An SMTP exception's message can quote the failing command,
  # and for AUTH PLAIN that command contains the password.
  puts "  ·  email NOT sent (#{error.class}) — the deploy itself is unaffected"
end
