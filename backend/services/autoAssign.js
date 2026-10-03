function shuffle(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [result[i], result[j]] = [result[j],result[i]];
    }

    return result;
}

function normalizeGender(gender) {
    const value = String(gender || "")
        .trim()
        .toLowerCase();

    if (value === "male" || value === "m") {
        return "male";
    }

    if (value === "female" || value === "f") {
        return "female";
    }

    return "unknown";
}

function createGwaGroups(students) {
    const sorted = [...students].sort((a, b) => {
        const gwaA = Number.isFinite(Number(a.gwa)) ? Number(a.gwa) : 0;
        const gwaB = Number.isFinite(Number(b.gwa)) ? Number(b.gwa) : 0;

        if (gwaB !== gwaA) {
            return gwaB - gwaA;
        }

        return Number(a.id) - Number(b.id);
    });

    const total = sorted.length;
    const topEnd = Math.ceil(total / 3);
    const middleEnd = Math.ceil((total * 2) / 3);

    return {
        top: sorted.slice(0, topEnd),
        middle: sorted.slice(topEnd,middleEnd),
        bottom: sorted.slice(middleEnd)
    };
}

function calculateTargets(totalStudents, advisers) {
    const sortedAdvisers = [...advisers].sort(
        (a, b) => Number(a.id) - Number(b.id)
    );

    if (sortedAdvisers.length === 0) {
        return [];
    }

    const base = Math.floor(totalStudents / sortedAdvisers.length);
    const remainder = totalStudents % sortedAdvisers.length;

    return sortedAdvisers.map((adviser, index) => ({
        id: adviser.id,
        target: base + (index < remainder ? 1 : 0)
    }));
}

function calculateTierTargets(gwaGroups,adviserTarget) {
    const tiers = ["top", "middle", "bottom" ];
    const totalStudents = tiers.reduce( (sum, tier) => sum + gwaGroups[tier].length, 0);

    if (totalStudents === 0) {
        return {top: 0,middle: 0,bottom: 0};
    }

    const result = {};
    const fractionalParts = [];
    let assigned = 0;

    for (const tier of tiers) {
        const size = gwaGroups[tier].length;
        const ideal = (size / totalStudents) * adviserTarget;
        const floorValue = Math.floor(ideal);
        result[tier] = floorValue;
        assigned += floorValue;
        fractionalParts.push({ tier, fraction:ideal - floorValue});
    }

    let remaining = adviserTarget - assigned;

    fractionalParts.sort((a, b) => {
        if (b.fraction !== a.fraction) {
            return b.fraction - a.fraction;
        }
        const order = {top: 0, middle: 1,bottom: 2};
        return order[a.tier] - order[b.tier];
    });

    let index = 0;

    while (remaining > 0 && fractionalParts.length > 0) {
        const tier = fractionalParts[index].tier;
        result[tier]++;
        remaining--;
        index++;
        if (index >= fractionalParts.length) {
            index = 0;
        }
    }
    return result;
}

function calculateGenderTarget(tierStudents, targetCount) {
    const maleCount = tierStudents.filter(student =>normalizeGender(student.gender) ==="male").length;
    const femaleCount = tierStudents.filter(student =>normalizeGender(student.gender) ==="female").length;
    const knownGenderCount =maleCount + femaleCount;

    if (knownGenderCount === 0) {
        return {male: 0,female: 0};
    }

    const idealMale = (maleCount / knownGenderCount) *targetCount;
    const idealFemale = (femaleCount / knownGenderCount) * targetCount;
    let maleTarget = Math.floor(idealMale);
    let femaleTarget = Math.floor(idealFemale);
    let remaining = targetCount - maleTarget - femaleTarget;

    while (remaining > 0) {
        const maleFraction = idealMale - maleTarget;
        const femaleFraction = idealFemale - femaleTarget;

        if (maleFraction >= femaleFraction) {
            maleTarget++;
        } else {
            femaleTarget++;
        }
        remaining--;
    }

    maleTarget = Math.min(maleTarget, maleCount);
    femaleTarget = Math.min(femaleTarget, femaleCount);
    
    return {male: maleTarget, female: femaleTarget};
}


function selectBalancedCandidates(candidates, take, currentGenderCounts, targetGenderCounts) {
    const remaining = shuffle(candidates);
    const selected = [];
    let maleCount = currentGenderCounts.male;
    let femaleCount = currentGenderCounts.female;

    while (selected.length < take && remaining.length > 0) {
        const maleNeed = targetGenderCounts.male - maleCount;
        const femaleNeed = targetGenderCounts.female - femaleCount;

        let preferredGender;

        if (maleNeed > femaleNeed) {
            preferredGender = "male";
        } else if (femaleNeed > maleNeed) {
            preferredGender = "female";
        } else {
            preferredGender = Math.random() < 0.5 ? "male" : "female";
        }

        let candidateIndexes = remaining.map((student, index) => ({student,index})).filter(item =>normalizeGender(item.student.gender) === preferredGender);

        if (candidateIndexes.length === 0) {
            candidateIndexes = remaining.map((student, index) => ({student,index})).filter(item =>normalizeGender(item.student.gender) !== "unknown");
        }

        if (candidateIndexes.length === 0) {
            candidateIndexes = remaining.map((student, index) => ({student,index}));
        }

        const chosen =candidateIndexes[0];
        selected.push(chosen.student);
        remaining.splice(chosen.index,1);
        const gender =normalizeGender(chosen.student.gender);

        if (gender === "male") {
            maleCount++;
        } else if (gender === "female") {
            femaleCount++;
        }
    }

    return selected;
}

function selectStudentsForAdviser({adviserId, advisers, allGradeStudents, unassignedStudents}) {
    const adviser = advisers.find(item => Number(item.id) === Number(adviserId));

    if (!adviser) {
        throw new Error("Adviser was not found.");
    }

    // Smallest class size every adviser must reach. Math.max keeps it at 1 when
    // there are fewer students than advisers.
    const baseSize = Math.max(1, Math.floor(allGradeStudents.length / advisers.length));

    const currentStudents = allGradeStudents.filter(student => Number(student.adviser_id) === Number(adviserId));
    const currentCount = currentStudents.length;

    if (currentCount >= baseSize) {
        return {selected: [], target: currentCount, currentCount, remainingQuota: 0};
    }

    // Advisers who still need to fill a class (the current adviser always counts)
    const advisersStillToFill = advisers.filter(item => {
        if (Number(item.id) === Number(adviserId)) return true;
        const count = allGradeStudents.filter(student => Number(student.adviser_id) === Number(item.id)).length;
        return count < baseSize;
    }).length;

    const remainingQuota = Math.min(
        Math.ceil(unassignedStudents.length / advisersStillToFill),
        unassignedStudents.length
    );
    const target = currentCount + remainingQuota;

    const gwaGroups = createGwaGroups(allGradeStudents);
    const studentTierMap = new Map();

    for (const tierName of ["top", "middle", "bottom"]) {
        for (const student of gwaGroups[tierName]) {
            studentTierMap.set(student.id, tierName);
        }
    }

    const tierTargets = calculateTierTargets(gwaGroups, target);
    const currentTierCounts = {top: 0, middle: 0, bottom: 0};

    for (const student of currentStudents) {
        const tier = studentTierMap.get(student.id);
        if (tier) currentTierCounts[tier]++;
    }

    const tierNeeds = {
        top: Math.max(0, tierTargets.top - currentTierCounts.top),
        middle: Math.max(0, tierTargets.middle - currentTierCounts.middle),
        bottom: Math.max(0, tierTargets.bottom - currentTierCounts.bottom)
    };

    const selected = [];

    for (const tierName of ["top", "middle", "bottom"]) {
        if (selected.length >= remainingQuota) {
            break;
        }

        const tierNeed = Math.min(tierNeeds[tierName], remainingQuota - selected.length);
        if (tierNeed <= 0) continue;

        const candidates = unassignedStudents.filter(student => studentTierMap.get(student.id) === tierName);
        if (candidates.length === 0) continue;

        const currentTierStudents = currentStudents.filter(student => studentTierMap.get(student.id) === tierName);
        const currentGenderCounts = {
            male: currentTierStudents.filter(student => normalizeGender(student.gender) === "male").length,
            female: currentTierStudents.filter(student => normalizeGender(student.gender) === "female").length
        };

        const targetGenderCounts = calculateGenderTarget(gwaGroups[tierName], currentTierStudents.length + tierNeed);
        const selectedFromTier = selectBalancedCandidates(candidates, tierNeed, currentGenderCounts, targetGenderCounts);

        selected.push(...selectedFromTier);
    }

    if (selected.length < remainingQuota) {
        const selectedIds = new Set(selected.map(student => student.id));
        const fallbackCandidates = shuffle(unassignedStudents.filter(student => !selectedIds.has(student.id)));
        const fallbackNeeded = remainingQuota - selected.length;

        selected.push(...fallbackCandidates.slice(0, fallbackNeeded));
    }

    return {selected, target, currentCount, remainingQuota};
}

module.exports = {
    shuffle, normalizeGender, createGwaGroups, calculateTargets,
    calculateTierTargets, calculateGenderTarget, selectBalancedCandidates, selectStudentsForAdviser
};