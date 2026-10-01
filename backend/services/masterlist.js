const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun, Header, Footer, AlignmentType, VerticalAlignTable } = require('docx');
const schoolDb = require("../database");
const fs = require("fs");
const path = require("path");

async function generateMasterlist(adviser) {
    console.log(adviser);
    const adviserId = adviser.id;
    const adviserName = adviser.full_name;
    let section = adviser.section;
    const adviserGradeLevel = adviser.grade_level;
    const studentStmt = schoolDb.prepare(`SELECT last_name, first_name, middle_name, extension_name, gender FROM students WHERE adviser_id = ? ORDER BY gender DESC, last_name COLLATE NOCASE ASC, first_name COLLATE NOCASE ASC`);
    const students = studentStmt.all(adviserId);
    const schoolStmt = schoolDb.prepare(`SELECT * FROM school WHERE id = 1`);
    const schoolInfo = schoolStmt.get();

    const males = students.filter(student => student.gender === "male");
    const females = students.filter(student => student.gender === "female");
    
    const maleNames = males.map(student => studentName(student));
    const femaleNames = females.map(student => studentName(student));

    const rows = [];

    rows.push(
        new TableRow({
            children: [
                new TableCell({
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({
                                    text: "MALE",
                                    font: "Arial Narrow",
                                    size: 24,
                                    bold: true
                                })
                            ]
                        })
                    ]
                }),
                new TableCell({
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({
                                    text: "FEMALE",
                                    font: "Arial Narrow",
                                    size: 24,
                                    bold: true
                                })
                            ]
                        })
                    ]
                })
            ]
        })
    );

    const rowCount = Math.max( maleNames.length, femaleNames.length);
    for (let i = 0; i < rowCount; i++) {
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun ({
                                        text: maleNames[i] ? `${i + 1}. ${maleNames[i]}` : "",
                                        font: "Arial Narrow",
                                        size: 24
                                    })
                                ]
                            })
                        ]
                    }),
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun ({
                                        text: femaleNames[i] ? `${i + 1}. ${femaleNames[i]}` : "",
                                        font: "Arial Narrow",
                                        size: 24
                                    })
                                ]
                            })
                        ]
                    })
                ]
            })
        )
    }
    const logoBuffer = fs.readFileSync(
        path.join(__dirname, "..", "assets", "image1.png")
    )
    const logo = new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: {
            after: 80
        },
        children: [
            new ImageRun({
                data: logoBuffer,
                type: "png",
                transformation: {
                    width: 70,
                    height: 70
                }
            })
        ]
    })
    const header = new Header({
        children: [
            logo,
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({
                        text: "Republic of the Philippines",
                        font: "Old English Text MT",
                        size: 24
                    })
                ]
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: {
                    after: 20,
                },
                children: [
                    new TextRun({
                        text: "Department of Education",
                        font: "Old English Text MT",
                        size: 36,
                        bold: true
                    })
                ]
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: {
                    after: 20
                },
                children: [
                    new TextRun({
                        text: `Region ${schoolInfo.region}`,
                        font: "Trajan Pro",
                        size: 20
                    })
                ]
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: {
                    after: 20
                },
                children: [
                    new TextRun({
                        text: `SCHOOLS DIVISION OF ${schoolInfo.division}`,
                        font: "Trajan Pro",
                        size: 20
                    })
                ]
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: {
                    after: 0
                },
                children: [
                    new TextRun({
                        text: schoolInfo.school_name,
                        font: "Trajan Pro",
                        size: 18,
                    })
                ]
            }),
            new Paragraph({
                spacing: {
                    before: 0,
                    after: 0
                },
                border: {
                    bottom: {
                        color: "000000",
                        space: 1,
                        style: "single",
                        size: 20
                    }
                },
                children: []
            })
        ]
    })
    const title = new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: {
            before: 100,
            after: 0
        },
        children: [
            new TextRun({
                text: "MASTERLIST",
                font: "Arial Narrow",
                size: 30,
                bold: true
            })
        ]
    })
    const sectionName = new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: {
            before: 0,
            after: 100
        },
        children: [
            new TextRun({
                text: `Grade ${adviserGradeLevel.slice(1)} ${section}` ,
                font: "Arial Narrow",
                size: 30,
                bold: true
            })
        ]
    })
    const preparedBy = new Paragraph({
        spacing: {
            before: 700,
            after: 0
        },
        children: [
            new TextRun({
                text: "Prepared By:",
                font: "Bookman Old Style",
                size: 24
            })
        ]
    })

    const adviserNameParagraph = new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: {
            before: 500,
            after: 0
        },
        children: [
            new TextRun({
                text: adviserName.toUpperCase(),
                font: "Bookman Old Style",
                size: 24,
                underline: {}
            })
        ]
    })

    const adviserPosition = new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            new TextRun({
                text: "Class Adviser",
                font: "Bookman Old Style",
                size: 24
            })
        ]
    })

    const logo2Buffer = fs.readFileSync(
        path.join(__dirname, "..", "assets", "image2.png")
    );

    const logo3Buffer = fs.readFileSync(
        path.join(__dirname, "..", "assets", "image3.png")
    )

    const footerTable = new Table({
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        width: {
                            size: 2100,
                            type: WidthType.DXA
                        },
                        margins: {
                            top: 0,
                            bottom: 0,
                            left: 0,
                            right: 0
                        },
                        verticalAlign: VerticalAlignTable.CENTER,
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.LEFT,
                                spacing: {
                                    before: 0,
                                    after: 0
                                },
                                children: [
                                    new ImageRun({
                                        data: logo2Buffer,
                                        type: "png",
                                        transformation: {
                                            width: 130,
                                            height: 75
                                        }
                                    })
                                ]
                            })
                        ]
                    }),
                    new TableCell({
                        width: {
                            size: 900,
                            type: WidthType.DXA
                        },
                        margins: {
                            top: 0,
                            bottom: 0,
                            left: 0,
                            right: 0
                        },
                        verticalAlign: VerticalAlignTable.CENTER,
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.LEFT,
                                spacing: {
                                    before: 0,
                                    after: 0
                                },
                                children: [
                                    new ImageRun({
                                        data: logo3Buffer,
                                        type: "png",
                                        transformation: {
                                            width: 47,
                                            height: 47
                                        }
                                    })
                                ]
                            })
                        ]
                    }),
                    new TableCell({
                        width: {
                            size: 4800,
                            type: WidthType.DXA
                        },
                        margins: {
                            top: 0,
                            bottom: 0,
                            left: 0,
                            right: 0
                        },
                        verticalAlign: VerticalAlignTable.CENTER,
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.LEFT,
                                children: [
                                    new TextRun({
                                        text: `Address : ${schoolInfo.address}`,
                                        font: "Trajan Pro",
                                        bold: true,
                                        size: 18
                                    })
                                ]
                            }),
                            new Paragraph({
                                alignment: AlignmentType.LEFT,
                                children: [
                                    new TextRun({
                                        text: `Email Address: ${schoolInfo.email}`,
                                        font: "Trajan Pro",
                                        bold: true,
                                        size: 18
                                    })
                                ]
                            }),
                            new Paragraph({
                                alignment: AlignmentType.LEFT,
                                children: [
                                    new TextRun({
                                        text: `Contact Number: ${schoolInfo.contact_no}`,
                                        font: "Trajan Pro",
                                        bold: true,
                                        size: 18
                                    })
                                ]
                            })
                        ]
                    }),
                    new TableCell({
                        width: {
                            size: 1879,
                            type: WidthType.DXA
                        },
                        margins: {
                            top: 0,
                            bottom: 0,
                            left: 0,
                            right: 0
                        },
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: []
                            })
                        ]
                    })
                ]
            })
        ],
        width: {
            size: 9679,
            type: WidthType.DXA
        },
        borders: {
            top: {
                style: "single",
                size: 24,
                color: "000000"
            },
            bottom: {
                style: "none",
                size: 0,
                color: "FFFFFF"
            },
            left: {
                style: "none",
                size: 0,
                color: "FFFFFF"
            },
            right: {
                style: "none",
                size: 0,
                color: "FFFFFF"
            },
            insideHorizontal: {
                style: "none",
                size: 0,
                color: "FFFFFF"
            },
            insideVertical: {
                style: "none",
                size: 0,
                color: "FFFFFF"
            }
        }
    })
    const footer = new Footer({
        children: [
            footerTable
        ]
    })
    const table = new Table({
        rows: rows,
        columnWidths: [4859, 4820],
        width: {
            size: 9679 ,
            type: WidthType.DXA
        }
    })
    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        size: {
                            width: 11906,
                            height: 16838
                        },
                        margin: {
                            top: 720,
                            bottom: 720,
                            left: 1080,
                            right: 1080,
                            header: 200,
                            footer: 100
                        }
                    }
                },
                headers: {
                    default: header
                },
                children: [
                    
                    title,
                    sectionName,
                    table,
                    preparedBy,
                    adviserNameParagraph,
                    adviserPosition
                ],
                footers: {
                    default: footer
                }
            }
        ]
    })
    const buffer = await Packer.toBuffer(doc);

    return buffer;
}

function studentName(student) {
    const extensionName = student.extension_name ? ` ${student.extension_name}` : "";
    const middleInitial = student.middle_name ? ` ${student.middle_name.charAt(0)}.` : "";
    const fullName = `${student.last_name}, ${student.first_name}${middleInitial}${extensionName}`;
    return fullName.toUpperCase();
}

module.exports = {
    generateMasterlist
}
