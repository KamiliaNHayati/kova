;; Kova Agent Wallet - Escrow + x402 Autonomous Payments
;;
;; Escrow pattern: user deposits once, authorized agents release
;; funds to services autonomously. Contract enforces spending rules.
;;
;; Flow:
;;   1. User calls create-wallet + deposit  (signs once)
;;   2. User calls add-agent to authorize operator (signs once)
;;   3. Agent calls agent-pay(owner, service, amount) autonomously
;;      -> contract checks all rules
;;      -> contract transfers STX from escrow to service
;;      -> contract logs the spend
;;   4. User can withdraw / kill-switch / revoke anytime
;;
;; Key management:
;;   Hackathon: master mnemonic in .env, HD derivation per index
;;   Production: wrap seed in AWS KMS / GCP KMS / HSM

;; =====================
;; Error codes
;; =====================
(define-constant ERR-NOT-AGENT (err u101))
(define-constant ERR-WALLET-EXISTS (err u102))
(define-constant ERR-NO-WALLET (err u103))
(define-constant ERR-INSUFFICIENT-BALANCE (err u104))
(define-constant ERR-DAILY-LIMIT-EXCEEDED (err u105))
(define-constant ERR-PER-CALL-LIMIT-EXCEEDED (err u106))
(define-constant ERR-WALLET-INACTIVE (err u107))
(define-constant ERR-SERVICE-NOT-ALLOWED (err u108))
(define-constant ERR-ZERO-AMOUNT (err u109))
(define-constant ERR-INVALID-LIMIT (err u110))
(define-constant ERR-INVALID-PRINCIPAL (err u111))
(define-constant ERR-MAX-AGENTS (err u112))
(define-constant ERR-AGENT-EXISTS (err u113))
(define-constant ERR-AGENT-NOT-FOUND (err u114))
(define-constant ERR-TRANSFER-FAILED (err u115))

;; =====================
;; Constants
;; =====================
(define-constant MAX-AGENTS-PER-WALLET u5)

;; =====================
;; Data storage
;; =====================

;; User's wallet config (escrow balance + rules)
(define-map wallets
  principal
  {
    balance: uint,
    daily-limit: uint,
    per-call-limit: uint,
    spent-today: uint,
    last-reset-block: uint,
    active: bool
  }
)

;; Authorized agents (operators) per wallet owner
(define-map authorized-agents
  { owner: principal, agent: principal }
  bool
)

;; Number of agents per wallet
(define-map agent-count principal uint)

;; Allowlisted services per wallet
(define-map allowed-services
  { owner: principal, service: principal }
  bool
)

;; Spending log counter
(define-map spend-nonce principal uint)

;; Individual spend records (audit trail)
(define-map spend-log
  { owner: principal, nonce: uint }
  {
    agent: principal,
    service: principal,
    amount: uint,
    block: uint
  }
)

;; =====================
;; Read-only functions
;; =====================

(define-read-only (get-wallet (owner principal))
  (map-get? wallets owner)
)

(define-read-only (get-balance (owner principal))
  (match (map-get? wallets owner)
    wallet (get balance wallet)
    u0
  )
)

(define-read-only (get-spent-today (owner principal))
  (let ((wallet (unwrap! (map-get? wallets owner) u0)))
    (if (> (- burn-block-height (get last-reset-block wallet)) u144)
      u0
      (get spent-today wallet)
    )
  )
)

(define-read-only (get-daily-remaining (owner principal))
  (let ((wallet (unwrap! (map-get? wallets owner) u0)))
    (let (
      (current-spent (if (> (- burn-block-height (get last-reset-block wallet)) u144)
        u0
        (get spent-today wallet)
      ))
    )
      (if (>= current-spent (get daily-limit wallet))
        u0
        (- (get daily-limit wallet) current-spent)
      )
    )
  )
)

(define-read-only (is-agent-authorized (owner principal) (agent principal))
  (default-to false (map-get? authorized-agents { owner: owner, agent: agent }))
)

(define-read-only (get-agent-count (owner principal))
  (default-to u0 (map-get? agent-count owner))
)

(define-read-only (is-service-allowed (owner principal) (service principal))
  (default-to false (map-get? allowed-services { owner: owner, service: service }))
)

(define-read-only (get-spend-nonce (owner principal))
  (default-to u0 (map-get? spend-nonce owner))
)

(define-read-only (get-spend-record (owner principal) (nonce uint))
  (map-get? spend-log { owner: owner, nonce: nonce })
)

;; Pre-flight check: agent calls BEFORE agent-pay to verify rules
(define-read-only (validate-spend (owner principal) (service principal) (amount uint))
  (let (
    (wallet (unwrap! (map-get? wallets owner) ERR-NO-WALLET))
    (blocks-since-reset (- burn-block-height (get last-reset-block wallet)))
    (current-spent (if (> blocks-since-reset u144) u0 (get spent-today wallet)))
  )
    ;; Caller must be an authorized agent
    (asserts! (is-agent-authorized owner contract-caller) ERR-NOT-AGENT)
    ;; Wallet must be active (kill switch)
    (asserts! (get active wallet) ERR-WALLET-INACTIVE)
    ;; Amount must be positive
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    ;; Balance check
    (asserts! (>= (get balance wallet) amount) ERR-INSUFFICIENT-BALANCE)
    ;; Service must be allowlisted
    (asserts! (is-service-allowed owner service) ERR-SERVICE-NOT-ALLOWED)
    ;; Per-call limit
    (asserts! (<= amount (get per-call-limit wallet)) ERR-PER-CALL-LIMIT-EXCEEDED)
    ;; Daily limit (shared across all agents)
    (asserts! (<= (+ current-spent amount) (get daily-limit wallet)) ERR-DAILY-LIMIT-EXCEEDED)
    (ok true)
  )
)

;; =====================
;; Public functions
;; =====================

;; --- Deposit: user sends STX to escrow (one-time or top-up) ---
(define-public (deposit (amount uint))
  (let ((wallet (unwrap! (map-get? wallets contract-caller) ERR-NO-WALLET)))
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    ;; Transfer STX from user to contract
    (try! (stx-transfer? amount contract-caller (as-contract tx-sender)))
    ;; Update balance
    (map-set wallets contract-caller (merge wallet {
      balance: (+ (get balance wallet) amount)
    }))
    (ok true)
  )
)

;; --- Withdraw: user pulls STX from escrow ---
(define-public (withdraw (amount uint))
  (let (
    (wallet (unwrap! (map-get? wallets contract-caller) ERR-NO-WALLET))
    (caller contract-caller)
  )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (>= (get balance wallet) amount) ERR-INSUFFICIENT-BALANCE)
    ;; Transfer STX from contract to user
    (try! (as-contract (stx-transfer? amount tx-sender caller)))
    ;; Update balance
    (map-set wallets caller (merge wallet {
      balance: (- (get balance wallet) amount)
    }))
    (ok true)
  )
)

;; --- Agent Pay: the core autonomous function ---
;; Agent calls this to pay a service from escrow.
;; Atomic: validates rules -> transfers STX -> logs spend.
(define-public (agent-pay (owner principal) (service principal) (amount uint))
  (let (
    (wallet (unwrap! (map-get? wallets owner) ERR-NO-WALLET))
    (blocks-since-reset (- burn-block-height (get last-reset-block wallet)))
    (current-spent (if (> blocks-since-reset u144) u0 (get spent-today wallet)))
    (new-reset-block (if (> blocks-since-reset u144) burn-block-height (get last-reset-block wallet)))
    (nonce (default-to u0 (map-get? spend-nonce owner)))
  )
    ;; --- Validate all rules ---
    ;; Only authorized agent can pay
    (asserts! (is-agent-authorized owner contract-caller) ERR-NOT-AGENT)
    ;; Wallet must be active (kill switch)
    (asserts! (get active wallet) ERR-WALLET-INACTIVE)
    ;; Amount must be positive
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    ;; Sufficient escrow balance
    (asserts! (>= (get balance wallet) amount) ERR-INSUFFICIENT-BALANCE)
    ;; Service must be allowlisted
    (asserts! (is-service-allowed owner service) ERR-SERVICE-NOT-ALLOWED)
    ;; Per-call limit
    (asserts! (<= amount (get per-call-limit wallet)) ERR-PER-CALL-LIMIT-EXCEEDED)
    ;; Daily limit
    (asserts! (<= (+ current-spent amount) (get daily-limit wallet)) ERR-DAILY-LIMIT-EXCEEDED)

    ;; --- Transfer STX from escrow to service ---
    (try! (as-contract (stx-transfer? amount tx-sender service)))

    ;; --- Update state ---
    (map-set wallets owner (merge wallet {
      balance: (- (get balance wallet) amount),
      spent-today: (+ current-spent amount),
      last-reset-block: new-reset-block
    }))

    ;; --- Log the spend ---
    (map-set spend-log { owner: owner, nonce: nonce } {
      agent: contract-caller,
      service: service,
      amount: amount,
      block: burn-block-height
    })
    (map-set spend-nonce owner (+ nonce u1))

    (ok true)
  )
)

;; --- Create wallet with first agent ---
(define-public (create-wallet (agent principal) (daily-limit uint) (per-call-limit uint))
  (let ((principal-info (unwrap! (principal-destruct? contract-caller) ERR-INVALID-PRINCIPAL)))
    (asserts! (is-none (get name principal-info)) ERR-INVALID-PRINCIPAL)
    (asserts! (is-none (map-get? wallets contract-caller)) ERR-WALLET-EXISTS)
    (asserts! (> daily-limit u0) ERR-INVALID-LIMIT)
    (asserts! (> per-call-limit u0) ERR-INVALID-LIMIT)
    (asserts! (<= per-call-limit daily-limit) ERR-INVALID-LIMIT)
    (map-set wallets contract-caller {
      balance: u0,
      daily-limit: daily-limit,
      per-call-limit: per-call-limit,
      spent-today: u0,
      last-reset-block: burn-block-height,
      active: true
    })
    ;; Authorize the first agent
    (map-set authorized-agents { owner: contract-caller, agent: agent } true)
    (map-set agent-count contract-caller u1)
    (ok true)
  )
)

;; =====================
;; Owner management
;; =====================

;; Toggle kill switch -- immediately disables all agent-pay
(define-public (set-active (is-active bool))
  (let ((wallet (unwrap! (map-get? wallets contract-caller) ERR-NO-WALLET)))
    (map-set wallets contract-caller (merge wallet { active: is-active }))
    (ok true)
  )
)

;; Update spending limits (shared across all agents)
(define-public (set-limits (new-daily-limit uint) (new-per-call-limit uint))
  (let ((wallet (unwrap! (map-get? wallets contract-caller) ERR-NO-WALLET)))
    (asserts! (> new-daily-limit u0) ERR-INVALID-LIMIT)
    (asserts! (> new-per-call-limit u0) ERR-INVALID-LIMIT)
    (asserts! (<= new-per-call-limit new-daily-limit) ERR-INVALID-LIMIT)
    (map-set wallets contract-caller (merge wallet {
      daily-limit: new-daily-limit,
      per-call-limit: new-per-call-limit
    }))
    (ok true)
  )
)

;; Add a new authorized agent (max 5)
(define-public (add-agent (new-agent principal))
  (let (
    (wallet (unwrap! (map-get? wallets contract-caller) ERR-NO-WALLET))
    (count (default-to u0 (map-get? agent-count contract-caller)))
  )
    (asserts! (< count MAX-AGENTS-PER-WALLET) ERR-MAX-AGENTS)
    (asserts! (not (is-agent-authorized contract-caller new-agent)) ERR-AGENT-EXISTS)
    (map-set authorized-agents { owner: contract-caller, agent: new-agent } true)
    (map-set agent-count contract-caller (+ count u1))
    (ok true)
  )
)

;; Remove an authorized agent
(define-public (remove-agent (agent principal))
  (let (
    (wallet (unwrap! (map-get? wallets contract-caller) ERR-NO-WALLET))
    (count (default-to u0 (map-get? agent-count contract-caller)))
  )
    (asserts! (is-agent-authorized contract-caller agent) ERR-AGENT-NOT-FOUND)
    (map-set authorized-agents { owner: contract-caller, agent: agent } false)
    (map-set agent-count contract-caller (- count u1))
    (ok true)
  )
)

;; Backwards-compatible set-agent (adds without removing old)
(define-public (set-agent (new-agent principal))
  (begin
    (asserts! (is-some (map-get? wallets contract-caller)) ERR-NO-WALLET)
    (if (is-agent-authorized contract-caller new-agent)
      (ok true)
      (add-agent new-agent)
    )
  )
)

;; Add a service to the allowlist
(define-public (allow-service (service principal))
  (begin
    (asserts! (is-some (map-get? wallets contract-caller)) ERR-NO-WALLET)
    (map-set allowed-services { owner: contract-caller, service: service } true)
    (ok true)
  )
)

;; Remove a service from the allowlist
(define-public (disallow-service (service principal))
  (begin
    (asserts! (is-some (map-get? wallets contract-caller)) ERR-NO-WALLET)
    (map-set allowed-services { owner: contract-caller, service: service } false)
    (ok true)
  )
)
