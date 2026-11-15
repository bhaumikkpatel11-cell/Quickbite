# QuickBite: Business Rules v2.1

Status: authoritative. Self-contained. Replaces all earlier versions.

## 0. Conventions

- All times are IST (Asia/Kolkata, UTC+5:30, no daylight saving). Instants are stored in UTC and deadlines are computed in IST, never in host-local time.
- "Before T" means strictly earlier than T. An action at exactly T counts as at or after T.
- D is the service date (an IST calendar date). The day before is D-1.
- The server clock enforces every deadline on every request, whether or not any scheduler has run.
- **Provisional status** is computed live for display and is never stored as a result. **Final result** is written only at or after the attendance cutoff (section 5).
- Examples in section 18 are independent scenarios. Balances do not carry from one example to the next. Calendar: Mon 16 Nov 2026 to Mon 23 Nov 2026.

## 1. Time rules

| Rule | Value |
|---|---|
| Menu lock, and fixing of the selected subscription | 18:00:00 on D-1 |
| Reminder | 22:00 on D-1 |
| Attendance cutoff | 23:00:00 on D-1 |
| Scheduled delivery | 13:00 on D |
| Recovery deadline (configurable MVP operational assumption, not a guarantee of on-time preparation or delivery) | 10:00:00 on D |
| Report window | from 13:00:00 on D, up to but not including 00:00:00 on D+2 (through 23:59:59.999 on D+1) |

## 2. Plans, menus and service days

1. A provider can create multiple plans. Each has a fixed meal composition (items with quantities), a number of meal credits and a mock price. One credit is one daily tiffin.
2. **Plan edits.** Once any subscription exists for a plan, its composition, credits and price cannot change. The provider can still edit name and description. To change anything else, the provider archives the plan and creates a new one. Archived plans are hidden from new purchases only. Existing subscriptions keep being served.
3. Only plans of approved, enabled providers are listed for new purchases.
4. **Menus.** A menu belongs to one plan and one service date. The provider can create or change it before 18:00:00 on D-1. The server rejects changes from that instant on. Each save stores a composition snapshot on the menu, so the snapshot is final at lock. Later plan edits never alter it. Item quantities lock at 18:00, while headcount stays open until cutoff.
5. **Service days.** There is no weekly calendar. For a plan, a service day is a date with a locked, published menu. A date without a published menu generates no meal and consumes no credit.

## 3. Subscriptions and purchase

1. Payment is mock. The purchase time is the server timestamp of a successful mock payment. It creates a `PURCHASE_GRANT` ledger entry.
2. **Purchase restriction.** A customer can buy only when every subscription they hold has balance 0. This covers all providers and plans and includes paused subscriptions. It is checked at purchase time only. Cancellation returns can later leave more than one positive balance, and that is the only way it happens.
3. The customer cannot choose a start date. The first eligible service date follows from the selection rules in section 4.
4. **First eligible date preview.** Before mock checkout, the server shows the actual first eligible date. The date is recomputed at payment. If it has changed (for example a deadline passed during checkout), the payment is rejected and the new date is shown for re-confirmation.
5. **Status is derived** from balance and provider state. Balance above 0 means Active, or Paused if the provider is disabled or unapproved. Balance 0 means Completed. A returned credit can move Completed back to Active or Paused.
6. **Selected for service is separate from status.** A subscription can hold unused credits without being selected.
7. The UI shows remaining credits and an estimated end date labelled "estimate". It assumes one meal per calendar day. Skips and days without a menu can shift it.

## 4. Subscription selection

1. Each customer has at most one selected subscription for future service.
2. A newly purchased subscription becomes selected automatically.
3. A returned credit never changes the selection.
4. A customer who holds credits in several subscriptions can explicitly select any subscription with balance above 0.
5. **When a change takes effect.** A selection change at instant t affects service date D if and only if t is before 18:00:00 on D-1. Otherwise it first affects D+1.

| Change made | First service date affected |
|---|---|
| Mon 17:59:59 | Tue 17 |
| Mon 18:00:00 | Wed 18 |
| Mon 23:30 | Wed 18 |
| Tue 00:10 | Wed 18 |

6. **Fixing.** At 18:00:00 on D-1 the selected subscription for D is fixed. It is read from the selection history by timestamp, so no job is needed.
7. **First-purchase exception.** This applies only to a customer who has never held any subscription. If their purchase falls from 18:00:00 up to before 23:00:00 on D-1, it establishes the selection for D. A repeat purchaser has no exception. A repeat purchase from 18:00:00 on D-1 first affects D+1.
8. **No automatic fallback.** If the selected subscription's provider is disabled, has no menu for D, or has no available credit, no meal is generated. Another subscription is never substituted.
9. A skip decision is stored per customer and service date, not per subscription. Changing the selection never clears an existing skip.
10. The customer sees the selected subscription and provider, the menu, the effective service date, and the reason if service is unavailable (provider disabled, no menu, no credit, starts later). Before cutoff these reasons are provisional and are labelled as such.

## 5. The service test and outcomes

**Final evaluation instant:** the attendance cutoff (23:00:00 on D-1). Evaluation uses only the state as of that instant. **All five conditions must hold:**

1. A selection for D exists (section 4.6).
2. The subscription was purchased before the cutoff instant and its first eligible date is on or before D.
3. Its balance before this meal's own consumption is above 0 (ordering in section 8.3).
4. The provider is approved and enabled at the cutoff instant. A status event at exactly the cutoff instant counts as at cutoff.
5. The plan has a locked published menu for D.

**Finality.** A final result (a meal record, or a recorded "no service" result with its reason) is written only at or after the cutoff instant. A menu preview, a checkout preview, a reminder evaluation or any other earlier check is provisional. It must never be stored permanently as "no service", because later events before cutoff can change the answer.

**Outcomes.** If the test fails, no meal record is created and the reason is recorded. If it passes, the meal record is:

- **Skipped** if a skip decision is on record at cutoff. No credit is consumed.
- **Included** otherwise. One credit is consumed.
- **Cancelled** only through the rules in sections 10 and 13, with reason provider disabled or missed processing.

There is at most one meal record per customer and service date, including Cancelled outcomes. It names exactly one supplying subscription.

## 6. Skip and undo

- A customer can skip or undo a skip for a date while the server time is before its cutoff. After that the server rejects it, even if processing is delayed.
- The decision instant is read after the customer's record is locked, so an accepted skip is always visible to cutoff processing, and a skip arriving after cutoff processing began is rejected.
- Repeated skip or undo actions are idempotent and never change a balance. Only cutoff processing changes balances.
- A customer is included by default. No confirmation action exists.

## 7. Reminder

- At 22:00 on D-1 the customer is reminded in-app and by email if the provisional service test passes as of that moment, no skip is on record, and the provider is approved and enabled at that moment.
- Skipped customers and customers who fail the test get no reminder. A first-time buyer who purchases after 22:00 gets none.
- The reminder evaluation never stores a "no service" result for anyone.
- **Expiry.** The reminder email has an expiry at the attendance cutoff (23:00:00 on D-1). It is checked before each send attempt. An expired reminder is recorded as Expired and no email is sent late. The in-app reminder is created when the reminder job runs. It remains a record.
- Email failures are retried a bounded number of times, then marked Failed. This never affects attendance, credits or delivery.

## 8. Credit ledger

**8.1 Entries.** Append-only, never edited:

- `PURCHASE_GRANT +N`, effective at the purchase time.
- `CUTOFF_CONSUME -1`, effective at the cutoff instant.
- `CANCEL_RETURN +1`, effective at the cancellation time (or the disable time when replayed), credited to the same subscription that supplied the meal. It references that meal's consumption.

Balance is the sum of entries. Credits are never transferred between subscriptions, refunded or expired, and never lost silently. Balance never goes below 0.

**8.2 Consistency requirements** (stated independently of any database):

- **C1.** At most one meal record per customer and service date, naming exactly one supplying subscription.
- **C2.** At most one cutoff consumption and at most one cancellation return per meal.
- **C3.** A cancellation return requires an existing consumption for the same meal.
- **C4. Atomic completion.** A meal, its consumption, its in-app notification, its processing record and any required outbox record are created together or not at all. A crash never leaves a consumption without its meal, or a meal without its required in-app notification or outbox record.
- **C5. Locking coordinates, uniqueness backs up.** Concurrent operations on the same customer, subscription, provider or meal are serialised in a fixed lock order (`ARCHITECTURE.md`). Unique constraints are a second line of defence and do not replace that coordination.
- **C6. Existing results win.** On any retry, an existing finalized result is recognised before eligibility is re-evaluated.
- **C7. In-app notifications:** exactly one durable record per event.
- **C8. Email** is external and best-effort. Attempts are bounded. Duplicates are possible, for example if the provider accepts a message and the app crashes before recording it. Successful delivery is never guaranteed.

**8.3 Ordering of equal timestamps.** Entries for one subscription are ordered by (effective time, then entry sequence). The sequence is assigned while the subscription is locked, so it follows commit order. The "balance before entry E" is the sum of all entries ordered before E. For a new meal evaluated at cutoff T, it is the sum of all existing entries of that subscription with effective time at or before T, which excludes the meal's own consumption because that does not exist yet. Entries are not broadly excluded for being effective exactly at T. Example: a return (effective 23:00:00, sequence 41) and a consumption (effective 23:00:00, sequence 42) means the return counts toward the balance before the consumption. A last-credit consumption can never invalidate its own meal, because once its record exists a retry recognises it (C6) and does not evaluate again.

## 9. Notifications

- In-app notification types: reminder, meal included (created with the meal), meal cancelled (with reason), and delivery status change. Each has a unique event key and exactly one durable record (C7).
- Email is sent only for the reminder and for the first move of a meal to Dispatched. A correction followed by a second Dispatched sends no further email.
- Email is best-effort (C8). Failed, expired and unsent emails are recorded and visible to admin.

## 10. Cutoff processing and recovery

**10.1 Triggers.** Processing runs from the scheduler, a startup catch-up, and lazily on a request that needs the result. The first run wins. Each customer-date is processed in its own transaction. For one customer, dates are processed in ascending order. Processing a later date requires earlier dates to have final results.

**10.2 Decision point.** For each customer-date, the transaction acquires its required locks, then re-checks for an existing result (C6), then reads the authoritative clock once. This reading is the **decision instant**. It decides the outcome and is stored with the result. Lock waiting time does not count. The commit follows within the transaction timeout, so a result decided before 10:00 may commit a few seconds after. The system records both the decision instant and the completion time, and never claims that completion preceded 10:00. The existing rule is read as: finalization is allowed when the decision instant is before 10:00:00 on D.

**10.3 Recovery rule.**

- **Decision instant before 10:00:00 on D.** An overdue cutoff is finalized from the historical state in 10.4. The meal is marked "finalized late" with its decision instant and recovery time.
- **Decision instant at or after 10:00:00 on D.** An eligible Included meal that was never finalized becomes **Cancelled (missed processing)** with no consumption and no return, so the net credit effect is zero. A recorded Skipped decision stays Skipped.
- **Already finalized meals are never cancelled or refunded** because a retry ran late.
- A Cancelled (missed processing) meal gets an in-app notice "service not processed, no credit used". The provider cannot update it and it cannot receive new reports.
- Late finalization can leave the provider little preparation time while the credit stays consumed. The remedy is a report and the provider's response, with no automatic compensation. The system never claims that downtime cannot affect delivery.

**10.4 Historical state used:** purchase time and first eligible date, the selection for D from the selection history, the skip decision on record, the locked menu and composition snapshot, the provider status as of the cutoff instant from the status log, and the ledger ordered per 8.3.

**10.5 Provider disabling after cutoff when processing was delayed.** Disable events between cutoff and the decision instant are replayed:

| Situation | Outcome |
|---|---|
| Disabled at or before cutoff, even if re-enabled before processing | No meal, no credit |
| Disabled after cutoff, decision before 10:00 | Meal created Included with consumption effective at cutoff, then Cancelled with a return effective at the disable time. The meal was necessarily Pending. A later re-enable does not revive it. Net credit 0, with an audit pair. |
| Disabled after cutoff, decision at or after 10:00 | Cancelled (missed processing), no ledger entries |
| Disabled after the meal exists | Normal disabling rules (section 13) |

A historical "enabled" status never bypasses a later cancellation. A Skipped meal is unaffected by a later disable.

**10.6 Records and display.** For each service date the system records processing start and completion times, decision instants, recovery times and counts of on-time, late-finalized and cancelled meals. While candidates for a provider and date lack final results, the provider's day view shows "processing incomplete, counts not final". A mix of finalized and cancelled meals shows "recovery incomplete". Providers, customers and admin all see recovery times and the limits.

## 11. Headcount and preparation

- After cutoff the provider sees eligible meals split into Included, Skipped and Cancelled. Counts must equal the individual meal records.
- The prep sheet totals each item from Included meals using their recorded composition snapshots. 20 Included meals with four rotis each give 80 rotis. Cancelled and Skipped meals are excluded.
- Later plan edits never change locked records. Free-text requirements and customization are out of scope.

## 12. Delivery status

- Status applies to Included meals only: Pending, Preparing, Dispatched, Delivered. It is stored per meal. Providers can update meals in bulk, and each meal follows the same rules.
- **Corrections.** Forward by one step only. Back by one step is allowed from Preparing or Dispatched. Delivered is final. Every change is kept in a status history.
- **Disabled provider.** While the provider is disabled, an allowed in-progress meal cannot move back to Pending. Forward moves and Preparing/Dispatched corrections remain allowed.
- Each change creates an in-app notification. Email follows section 9.
- Email failure never undoes a valid update.

## 13. Provider disabling and permissions

**At disabling:**

1. The provider's plans are hidden from new purchases immediately.
2. Dates that have not reached cutoff generate no meals, and credits are untouched.
3. Meals past cutoff that are still Pending become Cancelled, and a return goes to each meal's own subscription.
4. Meals already Preparing or Dispatched can be finished by the provider and their credits stay consumed.
5. Delivered meals are unchanged.

**On re-enabling:** subscriptions resume automatically. Dates whose menu deadline or cutoff passed while disabled stay closed. The provider publishes menus normally for dates still before their 18:00:00 deadline. No other adjustment is made.

**While disabled, the provider MAY:**

- Update delivery status only for meals that were Preparing or Dispatched when disabling occurred.
- View, read-only, its own historical meal records, and the locked headcount and prep sheet for those in-progress meals.
- See the minimum information needed to handle reports: report type, description, status, the meal's date and status, the plan name, the customer's display name and delivery location.
- Respond to existing valid reports of any type, including Missing, and mark them Open or Resolved with a note.
- Keep access to existing reports on a meal that later becomes Cancelled. This does not allow creating new reports on cancelled meals.

**While disabled, the provider MAY NOT:**

- Publish or change menus, create or edit plans, or accept purchases.
- Access another provider's records, or any customer data unrelated to its own meals and reports.
- See customer email, phone or balances.

## 14. Reports

- The owning customer can report **Missing** or **Poor quality** with a 10 to 300 character description.
- The window is from 13:00:00 on D up to before 00:00:00 on D+2.
- **Missing** is allowed on any Included, non-Cancelled meal and does not require Delivered. **Poor quality** needs status Delivered.
- Skipped and Cancelled meals cannot receive new reports.
- There is one report per customer meal, of either type, with no edits and no reopening.
- The provider marks the report Open or Resolved with a resolution note. The customer sees the status and response. There is no automatic compensation and no refund.

## 15. Ratings

- The owning customer can rate a **Delivered** meal from 1 to 5 with an optional comment.
- There is **no deadline** for rating. A meal can be rated at any time after it is Delivered.
- Only one rating is allowed per customer meal. Ratings cannot be edited.
- Providers see the average meal rating per plan. Per-dish ratings are excluded. Comments are stored with the rating. Their display to providers is not part of the MVP.

## 16. Admin visibility

- Approve or disable providers, and view operational health (component health, pending background work, scheduler runs, outbox status).
- A read-only filtered report list (provider, status, date, type) with counts and no customer phone or email. Admin cannot resolve or edit reports.
- Admin view of customers holding credits on disabled providers (read-only count).

## 17. Known limitations

- A customer whose credits sit on a permanently disabled provider cannot buy anything else until they are used.
- If the selected subscription reaches balance 0 while another still has credits, service stops until the customer selects the other.
- Late recovery can leave little preparation time. The 10:00 threshold is configurable and is not a guarantee.
- Email may be delayed, duplicated, filtered or not delivered.

## 18. Examples

### Ex 1: Normal included meal
Opening: Priya has never held a subscription. Spice Kitchen is enabled.

| Time | Event | Result |
|---|---|---|
| Mon 3:00 PM | Checkout shows "first meal Tue 17 Nov"; she buys "Home Thali, 20 credits" (4 rotis, dal, sabzi, rice) | Balance 20. Selected. First affected date Tue. |
| Mon 5:30 PM | Provider publishes the Tue menu | Locks at 18:00 with a composition snapshot |
| Mon 10:00 PM | Reminder | Passes the provisional test, no skip: in-app plus an email outbox record |
| Mon 11:00 PM | Cutoff | Meal Included, consumption -1, balance 19, in-app notification, all in one transaction |
| After cutoff | Headcount | 20 included, 0 skipped. Prep sheet 20 x 4 = 80 rotis |
| Tue 9:00 AM / 12:15 PM / 1:20 PM | Preparing / Dispatched / Delivered | In-app each time, one email at Dispatched. She can now rate |

### Ex 2: Skip and undo
Opening: Priya's balance is 19, with a Wed menu published.

| Time | Action | Result | Balance |
|---|---|---|---|
| Tue 9:00 PM | Skip | Skipped | 19 |
| 9:01 PM | Skip again | No change | 19 |
| 9:30 PM | Undo | Included | 19 |
| 10:15 PM | Skip | Skipped | 19 |
| 11:00 PM | Cutoff | Meal Skipped, no ledger entry | 19 |
| 11:05 PM | Undo | Rejected, cutoff reached | 19 |

### Ex 3: Missing menu
Opening: Priya's balance is 19 and her Wed meal is Skipped. No Thu menu is published by Wed 18:00:00.

- No Thu meal exists, no reminder is sent and no credit is consumed. Balance stays 19. The end-date estimate moves later.
- Her Thu screen shows "no menu published" (provisional until cutoff). A provider's Wed 7:30 PM publish attempt is rejected.

### Ex 4: Purchase before and after cutoff
Target day is Tue 17 (cutoff Mon 23:00:00).

| Customer | Purchase | First meal | Why |
|---|---|---|---|
| Neha, first-time | Mon 5:59:59 PM | Tue | Selection change before 18:00 |
| Arjun, first-time | Mon 10:55 PM | Tue | First-purchase exception. No reminder, as he was not subscribed at 10 PM |
| Rahul, first-time | Mon 11:00:00 PM | Wed | Tue cutoff reached |
| Sana, first-time | Mon 11:30 PM | Wed | Same |
| Kabir, first-time | Tue 12:20 AM | Wed | Same |
| Dev, repeat (all balances 0) | Mon 7:00 PM | Wed | No exception for repeat purchasers |
| Mira, repeat | Mon 4:00 PM | Tue | Before 18:00 |

- Dev's checkout screen at 6:55 PM shows "first meal Wed 18 Nov". If he pays at 5:59:59 PM instead, it shows Tue.
- If a checkout opened at 5:58 PM shows Tue and payment completes at 6:02 PM, the payment is rejected and the page shows Wed for re-confirmation (repeat purchaser).
- If no menu exists for the first eligible date, the first meal is the next date with a published menu.

### Ex 5: Final credit and retry
Opening: Meera has 2 credits, selected. Spice Kitchen is enabled. Fri, Sat and Sun menus are published by Sat 18:00, so Sun's menu exists before Sun's credit is consumed.

| Cutoff | Event | Balance |
|---|---|---|
| Thu 23:00 (for Fri 20) | She had skipped Fri | 2 |
| Fri 23:00 (for Sat 21) | Included, -1 | 1 |
| Sat 23:00 (for Sun 22) | Included, -1 | 0 (Completed) |

- She cannot buy at Fri 11:30 PM because her balance is 1. At Sat 11:10 PM she can buy, and as a repeat purchaser her first affected date is Mon 23.
- **Retry:** the Sat 23:00 run is repeated at 11:10 PM by another trigger. The existing Sunday meal record is recognised first, so no evaluation happens, the meal stays Included and the balance stays 0. The balance before this meal's own consumption was 1, so the last-credit meal was valid.

### Ex 6: Duplicate execution and crash
Opening: Priya's balance is 20 and she is Included for Tue.

| Time | Trigger | Result |
|---|---|---|
| 11:00:02 PM | Scheduler starts, takes locks, then crashes before commit | Nothing exists: no meal, no consumption, no notification |
| 11:00:05 PM | Request-triggered run | Finds no result, processes everything in one transaction. Balance 19 |
| 11:00:06 PM | Scheduler retry | Existing result recognised, nothing to do |

- If two runs overlap, the second waits for the customer's lock and then sees the existing result. Balance is 19, with one meal, one ledger entry and one notification.
- **Email:** if the Dispatched email is accepted by the email provider and the app crashes before recording success, a duplicate email is possible. That is accepted behaviour.

### Ex 7: Scheduler downtime
Opening: Priya's balance is 20 and she is Included for Tue. Skipped customers are in the mix.

- **A. Host down Mon 9:50 PM to Tue 9:15 AM.** The 22:00 reminder was never created. After cutoff it is not sent. Skips after 23:00 were rejected by the server clock. At 9:15 AM the decision instant is before 10:00, so Tue is finalized from historical state. Priya is Included, finalized late, consumption effective at 23:00, balance 19. The provider sees counts at about 9:15 AM, which leaves about 3 hours 45 minutes before 13:00. This is shown as a limitation. The meal may be undeliverable.
- **B. First processing at 10:20 AM.** Priya's meal was never finalized, so it becomes Cancelled (missed processing). Balance stays 20 with no ledger entries, and she gets the in-app notice. Skipped customers stay Skipped. The meal is not reportable.
- **C. Straddle.** A run starts at 9:59:58 AM. Customer transactions whose decision instant is before 10:00:00 finalize late (some may commit after 10:00:00 and show their decision time). The rest become Cancelled. The day is labelled "recovery incomplete". A retry at 11 AM does not cancel finalized meals and completes the remaining ones.
- **D. Host down Mon 9:50 PM to 10:40 PM.** The reminder job runs at 10:40 PM. The in-app reminder is created and the email record is sent, since it is still before 23:00. Failures are retried then marked Failed.
- **E. Two days missed, resuming Wed 9:00 AM.** Processed in date order. Tue's deadline has passed, so Tue meals are Cancelled (missed processing). Wed meals are finalized late. No credit is deducted twice.

### Ex 8: Provider disabling and re-enable
Opening: admin disables Spice Kitchen on Tue 17 Nov at 12:30 PM. Its Tue meals:

| Customer | Status at 12:30 | Result |
|---|---|---|
| A | Dispatched | Provider can finish it. Credit stays consumed |
| B | Preparing | Same. B cannot be moved back to Pending |
| C | Pending | Cancelled, return +1 to C's subscription. The original -1 is not edited |
| D | Delivered | Unchanged |

- **Wed 18.** The provider is disabled at 23:00 Tue, so no meals are generated and no credits consumed. Customers see "Paused". No substitute is chosen.
- **Re-enable Thu 19 at 9:00 AM.** Thu 19 stays closed because its menu deadline (Wed 18:00) and cutoff (Wed 23:00) passed while disabled. Fri 20 is open. The provider can publish its menu until Thu 18:00:00. If it does, the normal reminder, cutoff and credit processing apply. If it misses 18:00 Thursday, Fri 20 is also closed.

### Ex 9: Disabling after cutoff with delayed processing
Opening: the Tue cutoff has not run (host down) and Priya is Included with balance 20.

| Disabled / re-enabled | First processing | Outcome | Ledger |
|---|---|---|---|
| Disabled Mon 10:30 PM, re-enabled 11:30 PM | 9:00 AM | Disabled at cutoff, so no meal | None, balance 20 |
| Disabled Tue 2:00 AM, re-enabled 6:00 AM | 9:00 AM | Created Included, then the 2 AM disable is replayed. Cancelled. Re-enable does not revive it | -1 (effective Mon 23:00), +1 (effective Tue 2:00 AM), balance 20 |
| Disabled Tue 2:00 AM | 10:30 AM | Cancelled (missed processing) | None, balance 20 |
| Enabled throughout | 9:00 AM | Finalized late | -1, balance 19 |

### Ex 10: Selection and returned credits
Opening: Ravi has S1 (Spice Kitchen, 1 credit, selected). Green Tiffin is enabled.

| When | Event | S1 | S2 |
|---|---|---|---|
| Mon 11:00 PM | Cutoff for Tue consumes S1's last credit | 0 (Completed) | n/a |
| Mon 11:20 PM | Buys S2 (10 credits, Green Tiffin). Allowed as all balances are 0. S2 selected, first affects Wed | 0 | 10 |
| Tue 12:30 PM | Spice Kitchen disabled. His Tue meal is Pending, so it is cancelled and the credit returns to S1 (Paused). S2 stays selected | 1 | 10 |
| Tue 11 PM, Wed 11 PM | Wed and Thu cutoffs, served by S2 | 1 | 9, then 8 |
| Thu 10:00 AM | Spice Kitchen re-enabled. Ravi selects S1. This is before 18:00 Thu, so it first affects Fri | 1 | 8 |
| Thu 11:00 PM | Fri cutoff, with a Fri menu published | 0 | 8 |
| Fri 11:00 PM | Cutoff for Sat. S1 is still selected with balance 0, so Sat has no service and the screen says "selected subscription has no credits". S2 is not used automatically | 0 | 8 |

- Ravi cannot buy during this time because S2 is positive. To use S2 for Sat, he must select it before Fri 18:00:00.
- **Skip retention.** If Ravi skipped Fri on Thu 9 AM, then selected S1 at Thu 10 AM, the skip stays and Fri is Skipped with no credit used.
- **Boundary.** If he selects S1 at Thu 6:30 PM, it first affects Sat, and Fri is served from the earlier selection.

### Ex 11: Reporting
Report window for Tue 17 is [Tue 13:00:00, Thu 19 00:00:00).

| Customer | Time | Action | Result |
|---|---|---|---|
| Priya (Dispatched) | Tue 12:59:59 PM | Missing | Rejected, window not open |
| Priya | Tue 1:20 PM | Missing: "Tiffin not received at the PG gate" | Accepted |
| Priya | Tue 1:25 PM | Poor quality | Rejected, one report per meal and not Delivered |
| Provider | Tue 5:00 PM | Resolved with note "Rider delayed, delivered 2:10 PM" | Priya sees status and note, credit unchanged |
| Priya | Tue 5:05 PM | Reopen | Not allowed |
| Arjun (his own meal, Delivered) | Wed 11:59:59 PM | Poor quality | Accepted |
| Arjun | Thu 00:00:00 | New report on that meal | Rejected, window closed |
| Kabir (Cancelled meal) | Tue 2:00 PM | Missing | Rejected, meal Cancelled |

- **Existing report on a later-cancelled meal.** Zoya's Pending Included meal gets her own Missing report at Tue 1:05 PM, which is accepted. Spice Kitchen is disabled at 2:00 PM, so her meal is Cancelled and her credit returns. The report stays visible and the disabled provider can still respond to it.
- The admin sees counts and the filtered list with no phone or email.

### Ex 12: Reminder expiry
Opening: Priya is Included for Tue. The 22:00 reminder job ran and created an in-app reminder and an email record that expires at 23:00:00.

- The email sender is down until 23:05. At 23:05 the record is checked before sending, found expired, and marked Expired. No late email is sent. The in-app reminder remains.
- If the sender had recovered at 22:40, the email would have been sent then.
- If the sender accepted a message at 22:59:58 and the response arrived at 23:00:03, the email counts as sent. A message already handed to the email provider cannot be recalled.

### Ex 13: Ratings
Opening: Arjun's Tue meal is Delivered. Kabir's Tue meal is Dispatched.

| Customer | Time | Action | Result |
|---|---|---|---|
| Arjun | Tue 2:30 PM | Rates 4 with a comment | Accepted |
| Arjun | Tue 2:31 PM | Rates 5 | Rejected, one rating per meal |
| Kabir | Tue 2:30 PM | Rates 3 | Rejected, not Delivered |
| Kabir | Thu 19 Nov | Rates 3 after the meal became Delivered Tue 3 PM | Accepted, since there is no deadline |

The provider sees the average rating for the plan across rated meals.
