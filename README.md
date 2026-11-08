# SKYPAY Full-stack starter

## কী আছে
- Node.js + Express API এবং SQLite ডেটাবেজ
- সার্ভার-সাইড অ্যাকাউন্ট; bcrypt password hashing
- HTTP-only session cookie, Helmet security headers, API rate limit
- Deposit request + transaction reference; admin approve/reject
- Withdrawal request; অনুমোদিত ব্যালেন্সের বেশি pending request করা যাবে না
- Immutable-style wallet ledger entries; approved deposit/withdrawal ও purchase entries
- Package orders; শুধু ব্যালেন্স থাকলে অর্ডার
- Admin account first run-এ তৈরি হয়; user-facing HTML-এ admin password নেই
- Responsive Bengali web interface

## চালানোর নিয়ম
1. Node.js 20 বা নতুন সংস্করণ ইনস্টল করুন।
2. এই ফোল্ডারে `.env.example` কপি করে `.env` বানান।
3. `SESSION_SECRET`-এ কমপক্ষে 32 অক্ষরের random secret দিন।
4. `ADMIN_PHONE` ও `ADMIN_PASSWORD` নিজের তথ্য দিয়ে বদলান (শক্তিশালী পাসওয়ার্ড)।
5. টার্মিনালে চালান:
   ```bash
   npm install
   npm start
   ```
6. ব্রাউজারে `http://localhost:3000` খুলুন।

## গুরুত্বপূর্ণ নিরাপত্তা ও পেমেন্ট সীমা
- এটি deploy করার জন্য starter, কোনো hosted/live service নয়। সার্ভারে HTTPS বাধ্যতামূলক করুন, `.env` কখনো প্রকাশ করবেন না, নিয়মিত backup নিন এবং production-এ persistent disk ও production session store (যেমন Redis/SQLite-backed store) ব্যবহার করুন।
- প্রথম অ্যাডমিন তৈরি হয় `ADMIN_PHONE`/`ADMIN_PASSWORD` দিয়ে। প্রথমবার চালুর পর এই environment credentials নিরাপদে রাখুন। ডিফল্ট পাসওয়ার্ড ব্যবহার করবেন না।
- Deposit approval-এর আগে বাস্তবে পেমেন্ট provider dashboard থেকে লেনদেন যাচাই করুন। শুধু গ্রাহকের দেওয়া reference দেখে অনুমোদন করবেন না।
- Withdrawal approval-এর পর আপনার অনুমোদিত পেমেন্ট চ্যানেল দিয়ে ম্যানুয়ালি টাকা পাঠিয়ে তারপর approve করুন। এই starter নিজে বিকাশ/নগদ/রকেট-এ টাকা পাঠায় না।
- সরাসরি payment API যুক্ত করতে সংশ্লিষ্ট provider-এর merchant account, official API documentation, credentials, webhook signature verification ও idempotency প্রয়োজন। কোনো PIN/OTP/password সংগ্রহ করবেন না।
- এখানে বিনিয়োগ, নিশ্চিত দৈনিক মুনাফা বা বাস্তব আর্থিক রিটার্নের দাবি নেই। প্যাকেজগুলো demo product/service হিসেবে রাখা হয়েছে। প্রকৃত বিক্রয়/সেবার বিবরণ, মূল্য, refund terms ও আইনগত অনুমোদন যোগ করুন।
- Production launch-এর আগে security review, CSRF strategy, persistent session store, audit logging, backups, monitoring, privacy policy ও terms of service যোগ করে পরীক্ষা করুন।
