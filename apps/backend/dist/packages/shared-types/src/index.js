"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketPriority = exports.TicketStatus = exports.LiveSessionStatus = exports.TransactionStatus = exports.TransactionCategory = exports.TransactionType = exports.TaskSubmissionStatus = exports.TaskType = exports.ClassStatus = exports.TrainerApprovalStatus = exports.Role = void 0;
var Role;
(function (Role) {
    Role["ADMIN"] = "ADMIN";
    Role["TRAINER"] = "TRAINER";
    Role["STUDENT"] = "STUDENT";
})(Role || (exports.Role = Role = {}));
var TrainerApprovalStatus;
(function (TrainerApprovalStatus) {
    TrainerApprovalStatus["PENDING_APPROVAL"] = "PENDING_APPROVAL";
    TrainerApprovalStatus["ACTIVE"] = "ACTIVE";
    TrainerApprovalStatus["REJECTED"] = "REJECTED";
    TrainerApprovalStatus["SUSPENDED"] = "SUSPENDED";
})(TrainerApprovalStatus || (exports.TrainerApprovalStatus = TrainerApprovalStatus = {}));
var ClassStatus;
(function (ClassStatus) {
    ClassStatus["ACTIVE"] = "ACTIVE";
    ClassStatus["COMPLETED"] = "COMPLETED";
    ClassStatus["ARCHIVED"] = "ARCHIVED";
})(ClassStatus || (exports.ClassStatus = ClassStatus = {}));
var TaskType;
(function (TaskType) {
    TaskType["DAILY"] = "DAILY";
    TaskType["STORY"] = "STORY";
    TaskType["PICTURE"] = "PICTURE";
    TaskType["REFLECTION"] = "REFLECTION";
    TaskType["MONTHLY_GOALS"] = "MONTHLY_GOALS";
    TaskType["MONTHLY_REFLECTION"] = "MONTHLY_REFLECTION";
})(TaskType || (exports.TaskType = TaskType = {}));
var TaskSubmissionStatus;
(function (TaskSubmissionStatus) {
    TaskSubmissionStatus["PENDING"] = "PENDING";
    TaskSubmissionStatus["PROCESSING"] = "PROCESSING";
    TaskSubmissionStatus["COMPLETED"] = "COMPLETED";
    TaskSubmissionStatus["FAILED"] = "FAILED";
})(TaskSubmissionStatus || (exports.TaskSubmissionStatus = TaskSubmissionStatus = {}));
var TransactionType;
(function (TransactionType) {
    TransactionType["CREDIT"] = "CREDIT";
    TransactionType["DEBIT"] = "DEBIT";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
var TransactionCategory;
(function (TransactionCategory) {
    TransactionCategory["CASH_PRIZE"] = "CASH_PRIZE";
    TransactionCategory["REFERRAL_BONUS"] = "REFERRAL_BONUS";
    TransactionCategory["WITHDRAWAL"] = "WITHDRAWAL";
    TransactionCategory["CLASS_FEE"] = "CLASS_FEE";
    TransactionCategory["MISSED_DAY_FINE"] = "MISSED_DAY_FINE";
})(TransactionCategory || (exports.TransactionCategory = TransactionCategory = {}));
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["PENDING"] = "PENDING";
    TransactionStatus["COMPLETED"] = "COMPLETED";
    TransactionStatus["REJECTED"] = "REJECTED";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
var LiveSessionStatus;
(function (LiveSessionStatus) {
    LiveSessionStatus["SCHEDULED"] = "SCHEDULED";
    LiveSessionStatus["LIVE"] = "LIVE";
    LiveSessionStatus["ENDED"] = "ENDED";
})(LiveSessionStatus || (exports.LiveSessionStatus = LiveSessionStatus = {}));
var TicketStatus;
(function (TicketStatus) {
    TicketStatus["OPEN"] = "OPEN";
    TicketStatus["IN_PROGRESS"] = "IN_PROGRESS";
    TicketStatus["RESOLVED"] = "RESOLVED";
    TicketStatus["CLOSED"] = "CLOSED";
})(TicketStatus || (exports.TicketStatus = TicketStatus = {}));
var TicketPriority;
(function (TicketPriority) {
    TicketPriority["LOW"] = "LOW";
    TicketPriority["MEDIUM"] = "MEDIUM";
    TicketPriority["HIGH"] = "HIGH";
})(TicketPriority || (exports.TicketPriority = TicketPriority = {}));
//# sourceMappingURL=index.js.map