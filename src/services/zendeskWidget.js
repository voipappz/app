import { useEffect } from 'react';

// voipappz Zendesk Web Widget — the same embed as voipappz.com. It floats on
// the right and carries Zendesk's own answer bot, Help Center articles and
// "Get in touch" ticket form, so tickets opened here land in voipappz.zendesk.com.
const ZENDESK_HOST = 'voipappz.zendesk.com';

/* eslint-disable */
// Zendesk's snippet, verbatim apart from the host constant.
const injectSnippet = () => {
  window.zEmbed||function(e,t){var n,o,d,i,s,a=[],r=document.createElement("iframe");window.zEmbed=function(){a.push(arguments)},window.zE=window.zE||window.zEmbed,r.src="javascript:false",r.title="",r.role="presentation",(r.frameElement||r).style.cssText="display: none",d=document.getElementsByTagName("script"),d=d[d.length-1],d.parentNode.insertBefore(r,d),i=r.contentWindow,s=i.document;try{o=s}catch(e){n=document.domain,r.src='javascript:var d=document.open();d.domain="'+n+'";void(0);',o=s}o.open()._l=function(){var e=this.createElement("script");n&&(this.domain=n),e.id="js-iframe-async",e.src="https://assets.zendesk.com/embeddable_framework/main.js",this.t=+new Date,this.zendeskHost=ZENDESK_HOST,this.zEQueue=a,this.body.appendChild(e)},o.write('<body onload="document._l();">'),o.close()}();
};
/* eslint-enable */

// Fired on window when the widget's contact form creates a ticket, so the
// Tickets screen can reload and show it.
export const ZENDESK_TICKET_SUBMITTED = 'zendeskTicketSubmitted';

const zE = (...args) => {
  if (typeof window.zE === 'function') window.zE(...args);
};

/** Opens the widget (e.g. from a sidebar button). */
export const openZendeskWidget = () => {
  zE('webWidget', 'show');
  zE('webWidget', 'open');
};

/**
 * Shows the widget while `enabled`, hides it otherwise. The script is
 * injected once on first enable and stays loaded; the signed-in admin's
 * name and email are prefilled so a ticket is attributed to them.
 *
 * Tickets from the widget get the same `customer:<uuid>` tag the API puts on
 * tickets it creates (voipappz-api Mediators::Zendesk::CreateTicket), which is
 * what the Tickets screen lists by.
 */
export const useZendeskWidget = (enabled, user, customerUuid) => {
  useEffect(() => {
    if (!enabled) {
      zE('webWidget', 'hide');
      return;
    }
    if (!window.zEmbed) {
      injectSnippet();
      zE('webWidget:on', 'userEvent', (event) => {
        if (event?.action === 'Contact Form Submitted') {
          window.dispatchEvent(new Event(ZENDESK_TICKET_SUBMITTED));
        }
      });
    }
    zE('webWidget', 'show');
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !customerUuid) return;
    zE('webWidget', 'updateSettings', {
      webWidget: { contactForm: { tags: [`customer:${customerUuid}`] } },
    });
  }, [enabled, customerUuid]);

  // Lift the launcher clear of the phone's bottom navigation bar. Zendesk
  // floats it bottom-right with a z-index above ours, so by default it sits on
  // top of the last tab and makes it untappable. `offset.mobile` is Zendesk's
  // own narrow-screen variant, so the desktop position is unaffected.
  //
  // The value has to be a literal: this is a third-party iframe, so it cannot
  // read --bottom-nav-height. 64px bar + 12px gap; if that variable changes,
  // change this too.
  useEffect(() => {
    if (!enabled) return;
    zE('webWidget', 'updateSettings', {
      webWidget: {
        offset: { mobile: { vertical: '76px' } },
      },
    });
  }, [enabled]);

  const name = user?.name || '';
  const email = user?.email || '';
  useEffect(() => {
    if (!enabled || !email) return;
    zE('webWidget', 'identify', { name, email });
    zE('webWidget', 'prefill', {
      name: { value: name, readOnly: false },
      email: { value: email, readOnly: true },
    });
  }, [enabled, name, email]);
};
