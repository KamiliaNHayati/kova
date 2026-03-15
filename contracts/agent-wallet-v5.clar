;; Kova Agent Wallet v5 - Per-Agent Escrow + Operator-Paid x402 Payments
;;
;; v5: operator-paid model for autonomous agent payments on Stacks.
;;
;; Architecture:
;;   - Owner registers an operator (backend) on-chain once.
;;   - Agent is purely logical software (no keys, no gas).
;;   - Operator signs agent-pay and pays tx fee.
;;   - Contract transfers STX from escrow to service + platform fee.
;;
;; Flow:
;;   1. Owner calls create-wallet(agent, daily, perCall)
;;   2. Owner calls register-operator(operator) -- one-time setup
;;   3. Owner calls deposit(agent, amount) -- fund agent escrow
;;   4. Owner calls allow-service(agent, service) -- per-agent allowlist
;;   5. Operator calls agent-pay(owner, agent, service, amount)
;;      -> checks wallet, limits, allowlist
;;      -> transfers (amount - 2% fee) to service
;;      -> transfers 2% fee to platform
;;      -> logs spend
;;   6. Owner can withdraw / kill-switch / revoke per agent
;;
;; Fee model (gross pricing):
;;   Prices registered by services are gross (include platform fee).
;;   platformFee = (amount * 200) / 10000  (2%)
;;   serviceAmount = amount - platformFee  (remainder -> service)
;;   Service receives 98% of the registered price.

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
(define-constant ERR-NOT-ADMIN (err u116))
(define-constant ERR-NO-OPERATOR (err u117))
(define-constant ERR-NOT-AUTHORIZED (err u118))

;; =====================
;; Constants & Config
;; =====================
(define-constant MAX-AGENTS-PER-WALLET u5)

;; Platform fee: 200 basis points = 2%
;; Fee rounding: platformFee = (amount * FEE_BPS) / 10000
;; serviceAmount = amount - platformFee  (remainder -> service)
(define-constant PLATFORM_FEE_BPS u200)

;; Toggle: set to true to also allow agent-callers (agent pays gas)
;; Default: false = operator-only (recommended for autonomous x402)
(define-constant ALLOW_AGENT_CALLERS false)

;; Platform admin = deployer (can change platform address)
(define-constant PLATFORM_ADMIN tx-sender)

;; Platform address (where fees go) -- configurable by admin
(define-data-var platform-address principal tx-sender)

;; =====================
;; Data storage
;; =====================

;; Per-agent wallet: each agent gets its own balance + limits
(define-map wallets
  { owner: principal, agent: principal }
  {
    balance: uint,
    daily-limit: uint,
    per-call-limit: uint,
    spent-today: uint,
    last-reset-block: uint,
    active: bool
  }
)

;; Number of agents per owner (for max-agents check)
(define-map agent-count principal uint)

;; Operator map: each owner can register one operator (backend)
(define-map operators
  { owner: principal }
  { operator: principal }
)

;; Per-agent allowed services
(define-map allowed-services
  { owner: principal, agent: principal, service: principal }
  bool
)

;; Per-agent spending log counter
(define-map spend-nonce
  { owner: principal, agent: principal }
  uint
)

;; Per-agent spend records (audit trail)
(define-map spend-log
  { owner: principal, agent: principal, nonce: uint }
  {
    service: principal,
    amount: uint,
    fee: uint,
    block: uint
  }
)

;; =====================
;; Read-only functions
;; =====================

(define-read-only (get-wallet (owner principal) (agent principal))
  (map-get? wallets { owner: owner, agent: agent })
)

(define-read-only (get-balance (owner principal) (agent principal))
  (match (map-get? wallets { owner: owner, agent: agent })
    wallet (get balance wallet)
    u0
  )
)

(define-read-only (get-spent-today (owner principal) (agent principal))
  (let ((wallet (unwrap! (map-get? wallets { owner: owner, agent: agent }) u0)))
    (if (> (- burn-block-height (get last-reset-block wallet)) u144)
      u0
      (get spent-today wallet)
    )
  )
)

(define-read-only (get-daily-remaining (owner principal) (agent principal))
  (let ((wallet (unwrap! (map-get? wallets { owner: owner, agent: agent }) u0)))
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

(define-read-only (is-agent-active (owner principal) (agent principal))
  (match (map-get? wallets { owner: owner, agent: agent })
    wallet (get active wallet)
    false
  )
)

(define-read-only (get-agent-count (owner principal))
  (default-to u0 (map-get? agent-count owner))
)

(define-read-only (is-service-allowed (owner principal) (agent principal) (service principal))
  (default-to false (map-get? allowed-services { owner: owner, agent: agent, service: service }))
)

(define-read-only (get-spend-nonce (owner principal) (agent principal))
  (default-to u0 (map-get? spend-nonce { owner: owner, agent: agent }))
)

(define-read-only (get-spend-record (owner principal) (agent principal) (nonce uint))
  (map-get? spend-log { owner: owner, agent: agent, nonce: nonce })
)

(define-read-only (get-operator (owner principal))
  (map-get? operators { owner: owner })
)

(define-read-only (get-platform-address)
  (var-get platform-address)
)

(define-read-only (get-platform-fee-bps)
  PLATFORM_FEE_BPS
)

;; Pre-flight check: validate-spend with explicit agent param
;; Called by backend before agent-pay to verify rules
(define-read-only (validate-spend (owner principal) (agent principal) (service principal) (amount uint))
  (let (
    (wallet (unwrap! (map-get? wallets { owner: owner, agent: agent }) ERR-NO-WALLET))
    (blocks-since-reset (- burn-block-height (get last-reset-block wallet)))
    (current-spent (if (> blocks-since-reset u144) u0 (get spent-today wallet)))
    (caller tx-sender)
    (op-record (map-get? operators { owner: owner }))
    (is-operator (match op-record
      op-data (is-eq caller (get operator op-data))
      false
    ))
    (is-agent-caller (is-eq caller agent))
    (authorized (if ALLOW_AGENT_CALLERS
      (or is-operator is-agent-caller)
      is-operator
    ))
  )
    ;; Authorization check matches agent-pay
    (asserts! authorized ERR-NOT-AUTHORIZED)
    ;; Wallet must be active (kill switch)
    (asserts! (get active wallet) ERR-WALLET-INACTIVE)
    ;; Amount must be positive
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    ;; Balance check
    (asserts! (>= (get balance wallet) amount) ERR-INSUFFICIENT-BALANCE)
    ;; Service must be allowlisted for this agent
    (asserts! (is-service-allowed owner agent service) ERR-SERVICE-NOT-ALLOWED)
    ;; Per-call limit
    (asserts! (<= amount (get per-call-limit wallet)) ERR-PER-CALL-LIMIT-EXCEEDED)
    ;; Daily limit
    (asserts! (<= (+ current-spent amount) (get daily-limit wallet)) ERR-DAILY-LIMIT-EXCEEDED)
    (ok true)
  )
)

;; =====================
;; Public functions
;; =====================

;; --- Operator management ---

;; Owner registers their backend operator principal (one-time setup)
(define-public (register-operator (operator principal))
  (begin
    (map-set operators { owner: tx-sender } { operator: operator })
    ;; Emit an event so off-chain indexers can easily detect the new operator
    (print { action: "register-operator", owner: tx-sender, operator: operator })
    (ok true)
  )
)

;; Owner revokes their operator
(define-public (revoke-operator)
  (begin
    (asserts! (is-some (map-get? operators { owner: tx-sender })) ERR-NO-OPERATOR)
    (map-delete operators { owner: tx-sender })
    (ok true)
  )
)

;; --- Platform admin ---

;; Admin can change the platform fee address
(define-public (set-platform-address (new-address principal))
  (begin
    (asserts! (is-eq tx-sender PLATFORM_ADMIN) ERR-NOT-ADMIN)
    (var-set platform-address new-address)
    (ok true)
  )
)

;; --- Create wallet for an agent (owner signs) ---
(define-public (create-wallet (agent principal) (daily-limit uint) (per-call-limit uint))
  (let (
    (count (default-to u0 (map-get? agent-count contract-caller)))
  )
    ;; Agent must not be the owner (prevents edge cases)
    (asserts! (not (is-eq agent contract-caller)) ERR-INVALID-PRINCIPAL)
    ;; Wallet must not already exist for this agent
    (asserts! (is-none (map-get? wallets { owner: contract-caller, agent: agent })) ERR-WALLET-EXISTS)
    ;; Max agents check
    (asserts! (< count MAX-AGENTS-PER-WALLET) ERR-MAX-AGENTS)
    ;; Validate limits
    (asserts! (> daily-limit u0) ERR-INVALID-LIMIT)
    (asserts! (> per-call-limit u0) ERR-INVALID-LIMIT)
    (asserts! (<= per-call-limit daily-limit) ERR-INVALID-LIMIT)
    ;; Create the per-agent wallet
    (map-set wallets { owner: contract-caller, agent: agent } {
      balance: u0,
      daily-limit: daily-limit,
      per-call-limit: per-call-limit,
      spent-today: u0,
      last-reset-block: burn-block-height,
      active: true
    })
    ;; Increment agent count
    (map-set agent-count contract-caller (+ count u1))
    (ok true)
  )
)

;; --- Deposit: user sends STX to a specific agent's escrow ---
(define-public (deposit (agent principal) (amount uint))
  (let ((wallet (unwrap! (map-get? wallets { owner: contract-caller, agent: agent }) ERR-NO-WALLET)))
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    ;; Transfer STX from user to contract
    (try! (stx-transfer? amount contract-caller current-contract))
    ;; Update agent's balance
    (map-set wallets { owner: contract-caller, agent: agent } (merge wallet {
      balance: (+ (get balance wallet) amount)
    }))
    (ok true)
  )
)

;; --- Withdraw: user pulls STX from a specific agent's escrow ---
(define-public (withdraw (agent principal) (amount uint))
  (let (
    (wallet (unwrap! (map-get? wallets { owner: contract-caller, agent: agent }) ERR-NO-WALLET))
    (caller contract-caller)
  )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (>= (get balance wallet) amount) ERR-INSUFFICIENT-BALANCE)

    ;; Use as-contract? with a proper allowance-list. Inside the body unwrap the transfer
    ;; using try! so the body does NOT return a response type.
    (try! (as-contract? ((with-stx amount))
             (try! (stx-transfer? amount tx-sender caller))))

    ;; Update agent's balance AFTER the transfer succeeded
    (map-set wallets { owner: caller, agent: agent } (merge wallet {
      balance: (- (get balance wallet) amount)
    }))

    (ok true)
  )
)

;; --- Agent Pay: the core autonomous payment function ---
;;
;; Caller model (controlled by ALLOW_AGENT_CALLERS):
;;   - Operator path (default): tx-sender must be the registered operator for owner
;;   - Agent path (toggle): tx-sender must equal the agent param (agent pays gas)
;;
;; Platform fee: 2% deducted from amount, remainder goes to service.
;; Fee rounding: platformFee = (amount * 200) / 10000, serviceAmount = amount - platformFee
;; This deterministic integer math guarantees platformFee + serviceAmount == amount.
;; Small arithmetic remainders from the fee division naturally waterfall straight to the service.
(define-public (agent-pay (owner principal) (agent principal) (service principal) (amount uint))
  (let (
    (caller tx-sender)
    (op-record (map-get? operators { owner: owner }))
    (is-operator (match op-record
      op-data (is-eq caller (get operator op-data))
      false
    ))
    (is-agent-caller (is-eq caller agent))
    (authorized (if ALLOW_AGENT_CALLERS
      (or is-operator is-agent-caller)
      is-operator
    ))
    (wallet (unwrap! (map-get? wallets { owner: owner, agent: agent }) ERR-NO-WALLET))
    (blocks-since-reset (- burn-block-height (get last-reset-block wallet)))
    (current-spent (if (> blocks-since-reset u144) u0 (get spent-today wallet)))
    (new-reset-block (if (> blocks-since-reset u144) burn-block-height (get last-reset-block wallet)))
    (nonce (default-to u0 (map-get? spend-nonce { owner: owner, agent: agent })))
    ;; Fee calculation: remainder -> service
    (platform-fee (/ (* amount PLATFORM_FEE_BPS) u10000))
    (service-amount (- amount platform-fee))
  )
    ;; Authorization check
    (asserts! authorized ERR-NOT-AUTHORIZED)
    ;; Wallet must be active
    (asserts! (get active wallet) ERR-WALLET-INACTIVE)
    ;; Amount must be positive
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    ;; Sufficient agent balance
    (asserts! (>= (get balance wallet) amount) ERR-INSUFFICIENT-BALANCE)
    ;; Service must be allowlisted for this agent
    (asserts! (is-service-allowed owner agent service) ERR-SERVICE-NOT-ALLOWED)
    ;; Per-call limit
    (asserts! (<= amount (get per-call-limit wallet)) ERR-PER-CALL-LIMIT-EXCEEDED)
    ;; Daily limit
    (asserts! (<= (+ current-spent amount) (get daily-limit wallet)) ERR-DAILY-LIMIT-EXCEEDED)

    ;; --- Transfer STX from escrow (contract) to service (minus fee) ---
    ;; --- Transfer platform fee to platform address ---
    ;; Combined allowance and both transfers inside one as-contract? block
    (try! (as-contract? ((with-stx service-amount) (with-stx platform-fee))
            (begin
              ;; unwrap each transfer so the final expression is not a response
              (try! (stx-transfer? service-amount tx-sender service))
              (if (> platform-fee u0)
                (try! (stx-transfer? platform-fee tx-sender (var-get platform-address)))
                true))))

    ;; --- Update agent's wallet state ---
    (map-set wallets { owner: owner, agent: agent } (merge wallet {
      balance: (- (get balance wallet) amount),
      spent-today: (+ current-spent amount),
      last-reset-block: new-reset-block
    }))

    ;; --- Log the spend (now includes fee) ---
    (map-set spend-log { owner: owner, agent: agent, nonce: nonce } {
      service: service,
      amount: amount,
      fee: platform-fee,
      block: burn-block-height
    })
    (map-set spend-nonce { owner: owner, agent: agent } (+ nonce u1))

    (ok true)
  )
)

;; =====================
;; Owner management
;; =====================

;; Toggle kill switch for a specific agent
(define-public (set-active (agent principal) (is-active bool))
  (let ((wallet (unwrap! (map-get? wallets { owner: contract-caller, agent: agent }) ERR-NO-WALLET)))
    (map-set wallets { owner: contract-caller, agent: agent } (merge wallet { active: is-active }))
    (ok true)
  )
)

;; Update spending limits for a specific agent
(define-public (set-limits (agent principal) (new-daily-limit uint) (new-per-call-limit uint))
  (let ((wallet (unwrap! (map-get? wallets { owner: contract-caller, agent: agent }) ERR-NO-WALLET)))
    (asserts! (> new-daily-limit u0) ERR-INVALID-LIMIT)
    (asserts! (> new-per-call-limit u0) ERR-INVALID-LIMIT)
    (asserts! (<= new-per-call-limit new-daily-limit) ERR-INVALID-LIMIT)
    (map-set wallets { owner: contract-caller, agent: agent } (merge wallet {
      daily-limit: new-daily-limit,
      per-call-limit: new-per-call-limit
    }))
    (ok true)
  )
)

;; Remove an agent -- BLOCKED if balance > 0 (must withdraw first)
(define-public (remove-agent (agent principal))
  (let (
    (count (default-to u0 (map-get? agent-count contract-caller)))
    (wallet (unwrap! (map-get? wallets { owner: contract-caller, agent: agent }) ERR-AGENT-NOT-FOUND))
  )
    (asserts! (is-eq (get balance wallet) u0) ERR-INSUFFICIENT-BALANCE)
    (map-delete wallets { owner: contract-caller, agent: agent })
    (map-set agent-count contract-caller (- count u1))
    (print { 
      action: "agent-removed", 
      owner: contract-caller, 
      agent: agent,
      warning: "allowlist entries for this agent persist - call disallow-service before removing"
    })
    (ok true)
  )
)

;; Add a service to a specific agent's allowlist
(define-public (allow-service (agent principal) (service principal))
  (begin
    (asserts! (is-some (map-get? wallets { owner: contract-caller, agent: agent })) ERR-NO-WALLET)
    (map-set allowed-services { owner: contract-caller, agent: agent, service: service } true)
    (ok true)
  )
)

;; Remove a service from a specific agent's allowlist
(define-public (disallow-service (agent principal) (service principal))
  (begin
    (asserts! (is-some (map-get? wallets { owner: contract-caller, agent: agent })) ERR-NO-WALLET)
    (map-set allowed-services { owner: contract-caller, agent: agent, service: service } false)
    (ok true)
  )
)